import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { packages } from "../../../../../db/schema";
import { ApiError, apiError, requireSameOrigin } from "../../../../../lib/api";
import { writeAudit } from "../../../../../lib/audit";
import { getActor, requireRole } from "../../../../../lib/auth";

export async function POST(
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
      throw new ApiError(400, "Encomenda inválida.");
    }
    const [updated] = await getDb()
      .update(packages)
      .set({ failedPickupAttempts: 0 })
      .where(
        and(
          eq(packages.id, id),
          eq(packages.condominiumId, actor.condominiumId),
          eq(packages.status, "waiting"),
        ),
      )
      .returning();
    if (!updated) throw new ApiError(404, "Encomenda não encontrada.");
    await writeAudit(actor, "package.pickup_unlocked", "package", id);
    return Response.json({
      package: {
        id: updated.id,
        status: updated.status,
        failedPickupAttempts: updated.failedPickupAttempts,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
