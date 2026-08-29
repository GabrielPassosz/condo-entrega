import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { packages } from "../../../../db/schema";
import { ApiError, apiError } from "../../../../lib/api";
import { getActor } from "../../../../lib/auth";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getActor();
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    const condition =
      actor.role === "resident"
        ? and(
            eq(packages.id, id),
            eq(packages.condominiumId, actor.condominiumId),
            eq(packages.residentId, actor.residentId ?? -1),
          )
        : and(
            eq(packages.id, id),
            eq(packages.condominiumId, actor.condominiumId),
          );
    const [item] = await getDb()
      .select({ photoKey: packages.photoKey, photoMime: packages.photoMime })
      .from(packages)
      .where(condition)
      .limit(1);
    if (!item) throw new ApiError(404, "Foto não encontrada.");

    const bucket = (env as unknown as { BUCKET?: R2Bucket }).BUCKET;
    if (!bucket) throw new ApiError(503, "Armazenamento indisponível.");
    const object = await bucket.get(item.photoKey);
    if (!object) throw new ApiError(404, "Foto não encontrada.");
    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType || item.photoMime,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
