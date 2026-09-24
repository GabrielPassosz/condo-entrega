import { and, count, desc, eq, like, or, sql, type SQL } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import {
  condominiums,
  notificationJobs,
  packages,
  residents,
} from "../../../db/schema";
import { ApiError, apiError, requireSameOrigin } from "../../../lib/api";
import { writeAudit } from "../../../lib/audit";
import { getActor, requireRole } from "../../../lib/auth";
import { expiryDate } from "../../../lib/dates";
import { enqueuePackageNotification } from "../../../lib/notifications";
import {
  generatePickupCode,
  protectPickupCode,
  revealPickupCode,
} from "../../../lib/pickup-code";
import { safeText } from "../../../lib/normalize";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function getBucket() {
  const bucket = (env as unknown as { BUCKET?: R2Bucket }).BUCKET;
  if (!bucket) throw new ApiError(503, "Armazenamento de fotos indisponível.");
  return bucket;
}

async function residentPickupCode(row: {
  id: number;
  idempotencyKey: string;
  pickupCode: string;
  pickupCodeEncrypted: string;
}) {
  if (row.pickupCodeEncrypted) {
    return revealPickupCode(
      row.pickupCodeEncrypted,
      row.idempotencyKey || `legacy-package-${row.id}`,
    );
  }
  return /^\d{6}$/.test(row.pickupCode) ? row.pickupCode : undefined;
}

export async function GET(request: Request) {
  try {
    const actor = await getActor();
    const url = new URL(request.url);
    const page = Math.max(
      1,
      Math.floor(Number(url.searchParams.get("page")) || 1),
    );
    const pageSize = Math.max(
      1,
      Math.min(
        100,
        Math.floor(Number(url.searchParams.get("pageSize")) || 50),
      ),
    );
    const status = url.searchParams.get("status");
    const query = safeText(url.searchParams.get("q"), 100);
    const conditions: SQL[] = [eq(packages.condominiumId, actor.condominiumId)];
    if (actor.role === "resident") {
      conditions.push(eq(packages.residentId, actor.residentId ?? -1));
    }
    if (status === "waiting" || status === "withdrawn") {
      conditions.push(eq(packages.status, status));
    }
    if (query) {
      const pattern = `%${query}%`;
      const search = or(
        like(residents.name, pattern),
        like(residents.unit, pattern),
        like(packages.description, pattern),
        like(packages.trackingCode, pattern),
      );
      if (search) conditions.push(search);
    }
    const condition = and(...conditions);
    const db = getDb();
    const [[totalRow], rows] = await Promise.all([
      db
        .select({ value: count() })
        .from(packages)
        .innerJoin(residents, eq(packages.residentId, residents.id))
        .where(condition),
      db
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
          failedPickupAttempts: packages.failedPickupAttempts,
          receivedAt: packages.receivedAt,
          notifiedAt: packages.notifiedAt,
          withdrawnAt: packages.withdrawnAt,
          pickupCode: packages.pickupCode,
          pickupCodeEncrypted: packages.pickupCodeEncrypted,
          idempotencyKey: packages.idempotencyKey,
          photoKey: packages.photoKey,
        })
        .from(packages)
        .innerJoin(residents, eq(packages.residentId, residents.id))
        .where(condition)
        .orderBy(desc(packages.receivedAt), desc(packages.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);

    const mapped = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        pickupCode:
          actor.role === "resident" ? await residentPickupCode(row) : undefined,
        pickupCodeEncrypted: undefined,
        idempotencyKey: undefined,
        photoKey: undefined,
        photoUrl: row.photoKey ? `/api/fotos/${row.id}` : "",
      })),
    );
    const total = totalRow?.value ?? 0;
    return Response.json({
      packages: mapped,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  let uploadedPhotoKey = "";
  try {
    requireSameOrigin(request);
    const actor = await getActor();
    requireRole(actor, ["admin", "porter"]);
    const form = await request.formData();
    const photo = form.get("photo");
    const residentId = Number(form.get("residentId"));
    const idempotencyKey = safeText(form.get("idempotencyKey"), 100);
    if (!(photo instanceof File) || !ALLOWED_IMAGE_TYPES.has(photo.type)) {
      throw new ApiError(400, "Tire ou selecione uma foto JPG, PNG ou WebP.");
    }
    if (photo.size <= 0 || photo.size > MAX_PHOTO_BYTES) {
      throw new ApiError(400, "A foto deve ter no máximo 5 MB.");
    }
    if (!Number.isInteger(residentId) || residentId <= 0) {
      throw new ApiError(400, "Confirme o morador antes de registrar.");
    }
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(idempotencyKey)) {
      throw new ApiError(400, "Identificador seguro da operação ausente.");
    }

    const db = getDb();
    const [duplicate] = await db
      .select()
      .from(packages)
      .where(
        and(
          eq(packages.condominiumId, actor.condominiumId),
          eq(packages.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (duplicate) {
      const [duplicateResident] = await db
        .select({ name: residents.name, unit: residents.unit })
        .from(residents)
        .where(
          and(
            eq(residents.id, duplicate.residentId),
            eq(residents.condominiumId, actor.condominiumId),
          ),
        )
        .limit(1);
      return Response.json({
        package: {
          id: duplicate.id,
          residentName: duplicateResident?.name ?? "Morador",
          unit: duplicateResident?.unit ?? "",
          pickupCode: await residentPickupCode(duplicate),
          photoUrl: duplicate.photoKey ? `/api/fotos/${duplicate.id}` : "",
        },
        notification: {
          status: duplicate.notificationStatus,
          error: duplicate.notificationError,
        },
        duplicate: true,
      });
    }

    const [[resident], [condominium]] = await Promise.all([
      db
        .select()
        .from(residents)
        .where(
          and(
            eq(residents.id, residentId),
            eq(residents.condominiumId, actor.condominiumId),
            eq(residents.active, true),
          ),
        )
        .limit(1),
      db
        .select()
        .from(condominiums)
        .where(
          and(
            eq(condominiums.id, actor.condominiumId),
            eq(condominiums.active, true),
          ),
        )
        .limit(1),
    ]);
    if (!resident) throw new ApiError(404, "Morador não encontrado.");
    if (!condominium) throw new ApiError(404, "Condomínio não encontrado.");

    const code = generatePickupCode();
    const protectedCode = await protectPickupCode(code, idempotencyKey);
    const photoBytes = new Uint8Array(await photo.arrayBuffer());
    // A chave determinística permite que uma repetição após queda sobrescreva
    // o mesmo objeto, em vez de criar fotos órfãs no R2.
    uploadedPhotoKey = `${actor.condominiumId}/packages/${idempotencyKey}`;
    await getBucket().put(uploadedPhotoKey, photoBytes, {
      httpMetadata: { contentType: photo.type },
      customMetadata: { profileId: String(actor.id) },
    });

    const now = new Date().toISOString();
    let created;
    try {
      const packageValues = {
          condominiumId: actor.condominiumId,
          residentId,
          description: safeText(form.get("description"), 300),
          trackingCode: safeText(form.get("trackingCode"), 200),
          // O OCR serve somente para a correspondência em memória. O texto
          // integral da etiqueta não é persistido por minimização de dados.
          scanText: "",
          photoKey: uploadedPhotoKey,
          photoMime: photo.type,
          photoExpiresAt: expiryDate(condominium.photoRetentionDays),
          idempotencyKey,
          pickupCode: "",
          pickupCodeEncrypted: protectedCode.encrypted,
          pickupCodeHash: protectedCode.hash,
          registeredBy: actor.displayName,
          receivedAt: now,
        };
      await db.batch([
        db.insert(packages).values(packageValues),
        db.insert(notificationJobs).values({
          condominiumId: actor.condominiumId,
          packageId: sql<number>`(
            SELECT ${packages.id}
            FROM ${packages}
            WHERE ${packages.condominiumId} = ${actor.condominiumId}
              AND ${packages.idempotencyKey} = ${idempotencyKey}
            LIMIT 1
          )`,
          availableAt: now,
        }),
      ]);
      [created] = await db
        .select()
        .from(packages)
        .where(
          and(
            eq(packages.condominiumId, actor.condominiumId),
            eq(packages.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      if (!created) throw new Error("A encomenda não foi confirmada pelo banco.");
    } catch (error) {
      const [existing] = await db
        .select()
        .from(packages)
        .where(
          and(
            eq(packages.condominiumId, actor.condominiumId),
            eq(packages.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      if (!existing) {
        await getBucket().delete(uploadedPhotoKey).catch(() => undefined);
        uploadedPhotoKey = "";
        throw error;
      }
      // Outra requisição com a mesma chave venceu a corrida e referencia o
      // mesmo objeto determinístico; não remova a foto confirmada por ela.
      uploadedPhotoKey = "";
      const [existingResident] = await db
        .select({ name: residents.name, unit: residents.unit })
        .from(residents)
        .where(
          and(
            eq(residents.id, existing.residentId),
            eq(residents.condominiumId, actor.condominiumId),
          ),
        )
        .limit(1);
      return Response.json({
        package: {
          id: existing.id,
          residentName: existingResident?.name ?? "Morador",
          unit: existingResident?.unit ?? "",
          pickupCode: await residentPickupCode(existing),
          photoUrl: existing.photoKey ? `/api/fotos/${existing.id}` : "",
        },
        notification: {
          status: existing.notificationStatus,
          error: existing.notificationError,
        },
        duplicate: true,
      });
    }
    uploadedPhotoKey = "";

    let notification;
    try {
      notification = await enqueuePackageNotification(
        created.id,
        actor.condominiumId,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message.slice(0, 500)
          : "Falha ao enfileirar o aviso.";
      await db
        .update(packages)
        .set({ notificationStatus: "failed", notificationError: message })
        .where(eq(packages.id, created.id));
      notification = { status: "failed" as const, error: message };
    }
    await writeAudit(actor, "package.created", "package", created.id, {
      notificationStatus: notification.status,
      photoExpiresAt: created.photoExpiresAt ?? "",
    }).catch((error) => console.error("Falha ao gravar auditoria", error));

    return Response.json(
      {
        package: {
          id: created.id,
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
    if (uploadedPhotoKey) {
      await getBucket().delete(uploadedPhotoKey).catch(() => undefined);
    }
    return apiError(error);
  }
}
