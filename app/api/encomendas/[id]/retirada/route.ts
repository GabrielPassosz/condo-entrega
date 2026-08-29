import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { packages } from "../../../../../db/schema";
import { ApiError, apiError, readJson } from "../../../../../lib/api";
import { getActor, requireRole } from "../../../../../lib/auth";
import { safeText } from "../../../../../lib/normalize";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getActor();
    requireRole(actor, ["admin", "porter"]);
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    const payload = await readJson<{ pickupCode?: string; withdrawnBy?: string }>(
      request,
    );
    const code = safeText(payload.pickupCode, 6);
    const withdrawnBy = safeText(payload.withdrawnBy, 160);
    if (!/^\d{6}$/.test(code) || !withdrawnBy) {
      throw new ApiError(400, "Informe o código de 6 dígitos e quem está retirando.");
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
      throw new ApiError(423, "Retirada bloqueada após cinco tentativas. Chame o administrador.");
    }
    if (item.pickupCode !== code) {
      await db
        .update(packages)
        .set({ failedPickupAttempts: item.failedPickupAttempts + 1 })
        .where(eq(packages.id, id));
      throw new ApiError(400, "Código de retirada incorreto.");
    }

    const [updated] = await db
      .update(packages)
      .set({
        status: "withdrawn",
        withdrawnBy,
        withdrawnAt: new Date().toISOString(),
      })
      .where(eq(packages.id, id))
      .returning();
    return Response.json({ package: updated });
  } catch (error) {
    return apiError(error);
  }
}
