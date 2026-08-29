import { and, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import {
  condominiums,
  messageLogs,
  packages,
  residents,
} from "../../../db/schema";
import { ApiError, apiError } from "../../../lib/api";
import { getActor, requireRole } from "../../../lib/auth";
import { safeText } from "../../../lib/normalize";
import {
  buildPackageMessage,
  callWhatsapp,
  whatsappConfigured,
} from "../../../lib/whatsapp-service";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function getBucket() {
  const bucket = (env as unknown as { BUCKET?: R2Bucket }).BUCKET;
  if (!bucket) throw new ApiError(503, "Armazenamento de fotos indisponível.");
  return bucket;
}

function pickupCode() {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(value).padStart(6, "0");
}

function extensionFor(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

async function sendNotification(input: {
  packageId: number;
  phone: string;
  message: string;
  photoBytes: Uint8Array;
  photoMime: string;
}) {
  const db = getDb();
  if (!whatsappConfigured()) {
    await db
      .update(packages)
      .set({
        notificationStatus: "not_configured",
        notificationError: "Conecte o WhatsApp na área administrativa.",
      })
      .where(eq(packages.id, input.packageId));
    return { status: "not_configured" as const, error: "WhatsApp não configurado." };
  }

  try {
    const response = await callWhatsapp<{ ok: boolean; messageId?: string }>("/send", {
      method: "POST",
      body: JSON.stringify({
        telefone: input.phone,
        mensagem: input.message,
        foto_base64: toBase64(input.photoBytes),
        foto_mime: input.photoMime,
        idempotency_key: String(input.packageId),
      }),
    });
    const now = new Date().toISOString();
    const remoteId = response.messageId ?? "";
    await db.batch([
      db
        .update(packages)
        .set({
          notificationStatus: "sent",
          notificationError: "",
          whatsappMessageId: remoteId,
          notifiedAt: now,
        })
        .where(eq(packages.id, input.packageId)),
      db.insert(messageLogs).values({
        packageId: input.packageId,
        status: "sent",
        remoteId,
      }),
    ]);
    return { status: "sent" as const, error: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Falha no envio.";
    await db.batch([
      db
        .update(packages)
        .set({ notificationStatus: "failed", notificationError: message })
        .where(eq(packages.id, input.packageId)),
      db.insert(messageLogs).values({
        packageId: input.packageId,
        status: "failed",
        error: message,
      }),
    ]);
    return { status: "failed" as const, error: message };
  }
}

export async function GET() {
  try {
    const actor = await getActor();
    const condition =
      actor.role === "resident"
        ? and(
            eq(packages.condominiumId, actor.condominiumId),
            eq(packages.residentId, actor.residentId ?? -1),
          )
        : eq(packages.condominiumId, actor.condominiumId);
    const rows = await getDb()
      .select({
        id: packages.id,
        residentId: packages.residentId,
        residentName: residents.name,
        unit: residents.unit,
        description: packages.description,
        trackingCode: packages.trackingCode,
        status: packages.status,
        notificationStatus: packages.notificationStatus,
        notificationError: packages.notificationError,
        registeredBy: packages.registeredBy,
        withdrawnBy: packages.withdrawnBy,
        receivedAt: packages.receivedAt,
        notifiedAt: packages.notifiedAt,
        withdrawnAt: packages.withdrawnAt,
        pickupCode: packages.pickupCode,
      })
      .from(packages)
      .innerJoin(residents, eq(packages.residentId, residents.id))
      .where(condition)
      .orderBy(desc(packages.receivedAt))
      .limit(250);

    return Response.json({
      packages: rows.map((row) => ({
        ...row,
        pickupCode: actor.role === "resident" ? row.pickupCode : undefined,
        photoUrl: `/api/fotos/${row.id}`,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getActor();
    requireRole(actor, ["admin", "porter"]);
    const form = await request.formData();
    const photo = form.get("photo");
    const residentId = Number(form.get("residentId"));
    if (!(photo instanceof File) || !ALLOWED_IMAGE_TYPES.has(photo.type)) {
      throw new ApiError(400, "Tire ou selecione uma foto JPG, PNG ou WebP.");
    }
    if (photo.size <= 0 || photo.size > MAX_PHOTO_BYTES) {
      throw new ApiError(400, "A foto deve ter no máximo 5 MB.");
    }
    if (!Number.isInteger(residentId) || residentId <= 0) {
      throw new ApiError(400, "Confirme o morador antes de registrar.");
    }

    const db = getDb();
    const [resident] = await db
      .select()
      .from(residents)
      .where(
        and(
          eq(residents.id, residentId),
          eq(residents.condominiumId, actor.condominiumId),
          eq(residents.active, true),
        ),
      )
      .limit(1);
    if (!resident) throw new ApiError(404, "Morador não encontrado.");

    const [condominium] = await db
      .select()
      .from(condominiums)
      .where(eq(condominiums.id, actor.condominiumId))
      .limit(1);
    const code = pickupCode();
    const photoBytes = new Uint8Array(await photo.arrayBuffer());
    const photoKey = `${actor.condominiumId}/packages/${crypto.randomUUID()}.${extensionFor(photo.type)}`;
    await getBucket().put(photoKey, photoBytes, {
      httpMetadata: { contentType: photo.type },
      customMetadata: { uploadedBy: actor.email },
    });

    const description = safeText(form.get("description"), 300);
    const trackingCode = safeText(form.get("trackingCode"), 200);
    const scanText = safeText(form.get("scanText"), 12000);
    const [created] = await db
      .insert(packages)
      .values({
        condominiumId: actor.condominiumId,
        residentId,
        description,
        trackingCode,
        scanText,
        photoKey,
        photoMime: photo.type,
        pickupCode: code,
        registeredBy: actor.displayName,
      })
      .returning();

    const notification = await sendNotification({
      packageId: created.id,
      phone: resident.phone,
      message: buildPackageMessage({
        residentName: resident.name,
        condominiumName: condominium?.name ?? "Condomínio",
        description,
        pickupCode: code,
      }),
      photoBytes,
      photoMime: photo.type,
    });

    return Response.json(
      {
        package: {
          ...created,
          residentName: resident.name,
          unit: resident.unit,
          pickupCode: code,
          photoUrl: `/api/fotos/${created.id}`,
        },
        notification,
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
