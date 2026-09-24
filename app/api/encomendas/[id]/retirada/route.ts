import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { packages } from "../../../../../db/schema";
import { ApiError, apiError, readJson, requireSameOrigin } from "../../../../../lib/api";
import { writeAudit } from "../../../../../lib/audit";
import { getActor, requireRole } from "../../../../../lib/auth";
import { verifyPickupCode } from "../../../../../lib/pickup-code";
import { safeText } from "../../../../../lib/normalize";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireSameOrigin(request);
    const actor = await getActor();
    requireRole(actor, ["admin", "porter"]);
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    const payload = await readJson<{ pickupCode?: string; withdrawnBy?: string }>(
      request,
    );
    const code = safeText(payload.pickupCode, 6);
    const withdrawnBy = safeText(payload.withdrawnBy, 160);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ApiError(400, "Encomenda inválida.");
    }
    if (!/^\d{6}$/.test(code) || !withdrawnBy) {
      throw new ApiError(
        400,
        "Informe o código de 6 dígitos e quem está retirando.",
      );
    }

    const db = getDb();
    const [item] = await db
      .select()
      .from(packages)
      .where(
        and(
          eq(packages.id, id),
          eq(packages.condominiumId, actor.condominiumId),
        ),
      )
      .limit(1);
    if (!item) throw new ApiError(404, "Encomenda não encontrada.");
    if (item.status === "withdrawn") {
      throw new ApiError(409, "Esta encomenda já foi retirada.");
    }
    if (item.failedPickupAttempts >= 5) {
      throw new ApiError(
        423,
        "Retirada bloqueada após cinco tentativas. Chame o administrador.",
      );
    }

    const contextKey =
      item.idempotencyKey || `legacy-package-${item.id}`;
    const matches = item.pickupCodeHash
      ? await verifyPickupCode(code, item.pickupCodeHash, contextKey)
      : item.pickupCode === code;
    if (!matches) {
      const [attempt] = await db
        .update(packages)
        .set({
          failedPickupAttempts: sql`${packages.failedPickupAttempts} + 1`,
        })
        .where(
          and(
            eq(packages.id, id),
            eq(packages.condominiumId, actor.condominiumId),
            eq(packages.status, "waiting"),
            lt(packages.failedPickupAttempts, 5),
          ),
        )
        .returning({ failedPickupAttempts: packages.failedPickupAttempts });
      if (!attempt || attempt.failedPickupAttempts >= 5) {
        await writeAudit(actor, "package.pickup_locked", "package", id).catch(
          (error) => console.error("Falha ao gravar auditoria", error),
        );
        throw new ApiError(
          423,
          "Retirada bloqueada após cinco tentativas. Chame o administrador.",
        );
      }
      throw new ApiError(400, "Código de retirada incorreto.");
    }

    const [updated] = await db
      .update(packages)
      .set({
        status: "withdrawn",
        withdrawnBy,
        withdrawnAt: new Date().toISOString(),
        idempotencyKey: contextKey,
        // Depois da retirada o código deixa de ter finalidade operacional.
        pickupCode: "",
        pickupCodeEncrypted: "",
        pickupCodeHash: "",
      })
      .where(
        and(
          eq(packages.id, id),
          eq(packages.condominiumId, actor.condominiumId),
          eq(packages.status, "waiting"),
          lt(packages.failedPickupAttempts, 5),
        ),
      )
      .returning();
    if (!updated) {
      throw new ApiError(
        409,
        "O estado da encomenda mudou. Atualize a lista e tente novamente.",
      );
    }
    await writeAudit(actor, "package.withdrawn", "package", id);
    return Response.json({
      package: {
        id: updated.id,
        status: updated.status,
        withdrawnBy: updated.withdrawnBy,
        withdrawnAt: updated.withdrawnAt,
        failedPickupAttempts: updated.failedPickupAttempts,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
