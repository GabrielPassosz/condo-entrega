import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { packages } from "../../../../db/schema";
import { ApiError, apiError, requireSameOrigin } from "../../../../lib/api";
import { writeAudit } from "../../../../lib/audit";
import { getActor, requireRole } from "../../../../lib/auth";

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
      throw new ApiError(400, "Encomenda inválida.");
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
    const [deleted] = await db
      .delete(packages)
      .where(
        and(
          eq(packages.id, id),
          eq(packages.condominiumId, actor.condominiumId),
        ),
      )
      .returning({ id: packages.id });
    if (!deleted) throw new ApiError(409, "A encomenda já foi alterada.");
    let photoDeletionDeferred = false;
    if (item.photoKey) {
      const bucket = (env as unknown as { BUCKET?: R2Bucket }).BUCKET;
      try {
        if (!bucket) throw new Error("R2 indisponível");
        await bucket.delete(item.photoKey);
      } catch {
        // O registro já foi removido de forma atômica. A varredura de órfãos
        // eliminará o objeto quando o R2 voltar a responder.
        photoDeletionDeferred = true;
      }
    }
    await writeAudit(actor, "package.deleted", "package", id, {
      photoDeletionDeferred,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
