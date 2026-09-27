import { and, eq, inArray, lte, ne, type SQL } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { createDb } from "../db";
import { auditLogs, packages } from "../db/schema";

type RetentionRuntimeEnv = {
  DB?: D1Database;
  BUCKET?: R2Bucket;
};

export async function purgeExpiredPhotos(
  condominiumId?: number,
  limit = 100,
  override?: RetentionRuntimeEnv,
) {
  const runtime =
    override ?? (env as unknown as RetentionRuntimeEnv);
  if (!runtime.DB || !runtime.BUCKET) {
    throw new Error("D1 ou R2 indisponível para executar a retenção.");
  }
  const db = createDb(runtime.DB);
  const conditions: SQL[] = [
    ne(packages.photoKey, ""),
    lte(packages.photoExpiresAt, new Date().toISOString()),
  ];
  if (condominiumId) {
    conditions.push(eq(packages.condominiumId, condominiumId));
  }
  const due = await db
    .select({
      id: packages.id,
      condominiumId: packages.condominiumId,
      photoKey: packages.photoKey,
    })
    .from(packages)
    .where(and(...conditions))
    .limit(Math.max(1, Math.min(limit, 500)));

  let purged = 0;
  const errors: string[] = [];
  for (const item of due) {
    try {
      await runtime.BUCKET.delete(item.photoKey);
      const now = new Date().toISOString();
      await db.batch([
        db
          .update(packages)
          .set({
            photoKey: "",
            photoMime: "",
            photoDeletedAt: now,
            scanText: "",
          })
          .where(
            and(
              eq(packages.id, item.id),
              eq(packages.photoKey, item.photoKey),
            ),
          ),
        db.insert(auditLogs).values({
          condominiumId: item.condominiumId,
          actorEmail: "system",
          action: "package.photo_retention_applied",
          entityType: "package",
          entityId: String(item.id),
        }),
      ]);
      purged += 1;
    } catch (error) {
      errors.push(
        `#${item.id}: ${error instanceof Error ? error.message : "falha"}`,
      );
    }
  }
  return { inspected: due.length, purged, errors: errors.slice(0, 20) };
}

/**
 * Remove uploads que ficaram sem registro no D1 após uma interrupção entre o
 * R2 e a transação do banco. Um período de carência protege uploads em curso e
 * um cursor persistido no próprio bucket mantém a varredura limitada sem
 * deixar objetos no fim da listagem permanentemente esquecidos.
 */
export async function purgeOrphanedPhotos(
  condominiumId?: number,
  limit = 500,
  graceHours = 24,
  override?: RetentionRuntimeEnv,
) {
  const runtime = override ?? (env as unknown as RetentionRuntimeEnv);
  if (!runtime.DB || !runtime.BUCKET) {
    throw new Error("D1 ou R2 indisponível para varrer fotos órfãs.");
  }
  const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 1000));
  const boundedGraceHours = Math.max(1, Math.min(Math.floor(graceHours), 168));
  const prefix = condominiumId ? `${condominiumId}/packages/` : undefined;
  const cursorKey = `_system/orphan-photo-sweep/${condominiumId ?? "all"}`;
  const savedCursor = await runtime.BUCKET.get(cursorKey)
    .then((object) => object?.text())
    .catch(() => undefined);

  let listing: R2Objects;
  try {
    listing = await runtime.BUCKET.list({
      prefix,
      limit: boundedLimit,
      cursor: savedCursor || undefined,
    });
  } catch (error) {
    if (!savedCursor) throw error;
    // Cursores podem expirar quando a listagem muda muito; reiniciar a volta
    // é seguro porque a exclusão é idempotente.
    await runtime.BUCKET.delete(cursorKey).catch(() => undefined);
    listing = await runtime.BUCKET.list({ prefix, limit: boundedLimit });
  }

  const cutoff = Date.now() - boundedGraceHours * 60 * 60 * 1000;
  const packageKey = /^\d+\/packages\/[a-zA-Z0-9_-]{16,100}$/;
  const candidates = listing.objects
    .filter(
      (object) =>
        packageKey.test(object.key) && object.uploaded.getTime() <= cutoff,
    )
    .map((object) => object.key);

  const referenced = new Set<string>();
  const db = createDb(runtime.DB);
  for (let index = 0; index < candidates.length; index += 50) {
    const keys = candidates.slice(index, index + 50);
    if (!keys.length) continue;
    const conditions: SQL[] = [inArray(packages.photoKey, keys)];
    if (condominiumId) {
      conditions.push(eq(packages.condominiumId, condominiumId));
    }
    const rows = await db
      .select({ photoKey: packages.photoKey })
      .from(packages)
      .where(and(...conditions));
    rows.forEach((row) => referenced.add(row.photoKey));
  }

  const orphaned = candidates.filter((key) => !referenced.has(key));
  const errors: string[] = [];
  let purged = 0;
  if (orphaned.length) {
    try {
      await runtime.BUCKET.delete(orphaned);
      purged = orphaned.length;
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message.slice(0, 500) : "Falha no R2.",
      );
    }
  }
  // Só avance depois de uma exclusão bem-sucedida; em falha, a mesma página
  // volta a ser inspecionada na próxima execução.
  if (!errors.length) {
    if (listing.truncated) {
      await runtime.BUCKET.put(cursorKey, listing.cursor, {
        httpMetadata: { contentType: "text/plain; charset=utf-8" },
      });
    } else {
      await runtime.BUCKET.delete(cursorKey).catch(() => undefined);
    }
  }

  return {
    inspected: listing.objects.length,
    eligible: candidates.length,
    purged,
    hasMore: listing.truncated || Boolean(errors.length),
    errors,
  };
}
