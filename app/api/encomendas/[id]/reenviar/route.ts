import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { packages } from "../../../../../db/schema";
import { ApiError, apiError, requireSameOrigin } from "../../../../../lib/api";
import { writeAudit } from "../../../../../lib/audit";
import { getActor, requireRole } from "../../../../../lib/auth";
import { enqueuePackageNotification } from "../../../../../lib/notifications";

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
    if (!Number.isInteger(id) || id <= 0) {
      throw new ApiError(400, "Encomenda inválida.");
    }
    const [item] = await getDb()
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
    if (item.status !== "waiting") {
      throw new ApiError(409, "A encomenda já foi retirada.");
    }
    if (!item.photoKey) {
      throw new ApiError(410, "A foto já foi removida pela política de retenção.");
    }
    const notification = await enqueuePackageNotification(
      id,
      actor.condominiumId,
    );
    await writeAudit(actor, "package.notification_requeued", "package", id, {
      status: notification.status,
    });
    return Response.json({ notification });
  } catch (error) {
    return apiError(error);
  }
}
