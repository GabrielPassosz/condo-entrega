import { and, eq, inArray } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import {
  messageLogs,
  notificationJobs,
  packages,
  profiles,
  residents,
} from "../../../../db/schema";
import { apiError, ApiError, readJson, requireSameOrigin } from "../../../../lib/api";
import { writeAudit } from "../../../../lib/audit";
import { getActor, requireRole } from "../../../../lib/auth";
import { normalizeText } from "../../../../lib/normalize";
import { residentValues, type ResidentInput } from "../route";

async function currentResident(id: number, condominiumId: number) {
  const [resident] = await getDb()
    .select()
    .from(residents)
    .where(
      and(
        eq(residents.id, id),
        eq(residents.condominiumId, condominiumId),
      ),
    )
    .limit(1);
  if (!resident) throw new ApiError(404, "Morador não encontrado.");
  return resident;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireSameOrigin(request);
    const actor = await getActor();
    requireRole(actor, ["admin"]);
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ApiError(400, "Morador inválido.");
    }
    const current = await currentResident(id, actor.condominiumId);
    const payload = await readJson<ResidentInput & { active?: boolean }>(request);
    const values = residentValues(
      {
        unit: payload.unit ?? payload.unidade ?? current.unit,
        block: payload.block ?? payload.bloco ?? current.block,
        apartment:
          payload.apartment ?? payload.apartamento ?? current.apartment,
        name: payload.name ?? payload.nome ?? current.name,
        phone: payload.phone ?? payload.telefone ?? current.phone,
        email: payload.email ?? current.email,
        authorizedPeople:
          payload.authorizedPeople ??
          payload.autorizados ??
          current.authorizedPeople,
        notes: payload.notes ?? payload.observacoes ?? current.notes,
        whatsappOptIn:
          payload.whatsappOptIn ?? payload.consentimentoWhatsapp,
      },
      actor.condominiumId,
      current.whatsappOptInAt,
    );
    const [updated] = await getDb()
      .update(residents)
      .set({
        ...values,
        active:
          typeof payload.active === "boolean" ? payload.active : current.active,
      })
      .where(
        and(
          eq(residents.id, id),
          eq(residents.condominiumId, actor.condominiumId),
        ),
      )
      .returning();
    await writeAudit(actor, "resident.updated", "resident", id, {
      active: updated.active,
      whatsappOptIn: Boolean(updated.whatsappOptInAt),
    });
    return Response.json({ resident: updated });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireSameOrigin(request);
    const actor = await getActor();
    requireRole(actor, ["admin"]);
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ApiError(400, "Morador inválido.");
    }
    await currentResident(id, actor.condominiumId);
    const mode = new URL(request.url).searchParams.get("mode") || "deactivate";
    if (!["deactivate", "anonymize", "delete"].includes(mode)) {
      throw new ApiError(400, "Modo de remoção inválido.");
    }
    let photoDeletionDeferred = false;

    const db = getDb();
    const packageRecords = await db
      .select({ id: packages.id, photoKey: packages.photoKey })
      .from(packages)
      .where(
        and(
          eq(packages.condominiumId, actor.condominiumId),
          eq(packages.residentId, id),
        ),
      );
    const total = packageRecords.length;
    if (mode === "delete" && total > 0) {
      throw new ApiError(
        409,
        "Este morador possui histórico. Use a anonimização para atender à exclusão de dados.",
      );
    }

    if (mode === "delete") {
      await db.batch([
        db.delete(profiles).where(
          and(
            eq(profiles.condominiumId, actor.condominiumId),
            eq(profiles.residentId, id),
          ),
        ),
        db.delete(residents).where(
          and(
            eq(residents.id, id),
            eq(residents.condominiumId, actor.condominiumId),
          ),
        ),
      ]);
    } else if (mode === "anonymize") {
      const anonymousUnit = `REMOVIDO-${id}`;
      const photoKeys = packageRecords
        .map((item) => item.photoKey)
        .filter(Boolean);
      const packageIds = db
        .select({ id: packages.id })
        .from(packages)
        .where(
          and(
            eq(packages.condominiumId, actor.condominiumId),
            eq(packages.residentId, id),
          ),
        );
      await db.batch([
        db.delete(profiles).where(
          and(
            eq(profiles.condominiumId, actor.condominiumId),
            eq(profiles.residentId, id),
          ),
        ),
        db.delete(notificationJobs).where(
          inArray(notificationJobs.packageId, packageIds),
        ),
        db.delete(messageLogs).where(
          inArray(messageLogs.packageId, packageIds),
        ),
        db.update(packages).set({
          description: "",
          trackingCode: "",
          scanText: "",
          photoKey: "",
          photoMime: "",
          photoDeletedAt: new Date().toISOString(),
          pickupCode: "",
          pickupCodeEncrypted: "",
          pickupCodeHash: "",
          notificationError: "",
          whatsappMessageId: "",
          withdrawnBy: "",
        }).where(
          and(
            eq(packages.condominiumId, actor.condominiumId),
            eq(packages.residentId, id),
          ),
        ),
        db.update(residents).set({
          unit: anonymousUnit,
          block: "",
          apartment: "",
          name: "Morador removido",
          phone: "",
          email: "",
          authorizedPeople: "",
          notes: "",
          whatsappOptInAt: null,
          normalizedName: normalizeText(`morador removido ${id}`),
          normalizedUnit: normalizeText(anonymousUnit),
          active: false,
          updatedAt: new Date().toISOString(),
        }).where(
          and(
            eq(residents.id, id),
            eq(residents.condominiumId, actor.condominiumId),
          ),
        ),
      ]);
      if (photoKeys.length) {
        const bucket = (env as unknown as { BUCKET?: R2Bucket }).BUCKET;
        try {
          if (!bucket) throw new Error("R2 indisponível");
          for (let index = 0; index < photoKeys.length; index += 1000) {
            await bucket.delete(photoKeys.slice(index, index + 1000));
          }
        } catch {
          // As referências foram removidas no D1; a rotina de órfãos conclui
          // a exclusão assim que o armazenamento estiver disponível.
          photoDeletionDeferred = true;
        }
      }
    } else {
      await db.batch([
        db
          .update(profiles)
          .set({
            active: false,
            residentId: null,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(profiles.condominiumId, actor.condominiumId),
              eq(profiles.residentId, id),
            ),
          ),
        db
          .update(residents)
          .set({ active: false, updatedAt: new Date().toISOString() })
          .where(
            and(
              eq(residents.id, id),
              eq(residents.condominiumId, actor.condominiumId),
            ),
          ),
      ]);
    }

    await writeAudit(actor, `resident.${mode}`, "resident", id, {
      packagesPreserved: total,
      photoDeletionDeferred,
    });
    return Response.json({ ok: true, mode });
  } catch (error) {
    return apiError(error);
  }
}
