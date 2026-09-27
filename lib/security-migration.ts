import { and, eq, isNull, ne, or, type SQL } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { createDb } from "../db";
import { condominiums, packages } from "../db/schema";
import { expiryDate } from "./dates";
import { protectPickupCode } from "./pickup-code";

type SecurityMigrationEnv = {
  DB?: D1Database;
  PICKUP_CODE_SECRET?: string;
};

async function runBatches(
  database: D1Database,
  statements: D1PreparedStatement[],
) {
  for (let index = 0; index < statements.length; index += 50) {
    await database.batch(statements.slice(index, index + 50));
  }
}

function parseStoredDate(value: string) {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Preenche metadados introduzidos depois do MVP em lotes pequenos. O trabalho
 * fica fora da migração de esquema para não bloquear a publicação em bases
 * grandes e pode ser repetido com segurança.
 */
export async function backfillLegacyMetadata(
  condominiumId?: number,
  limit = 100,
  override?: SecurityMigrationEnv,
) {
  const runtime = override ?? (env as unknown as SecurityMigrationEnv);
  if (!runtime.DB) throw new Error("D1 indisponível para atualizar dados legados.");
  const db = createDb(runtime.DB);
  const boundedLimit = Math.max(1, Math.min(limit, 500));

  const condominiumConditions: SQL[] = [
    or(eq(condominiums.slug, ""), eq(condominiums.updatedAt, ""))!,
  ];
  if (condominiumId) {
    condominiumConditions.push(eq(condominiums.id, condominiumId));
  }
  const legacyCondominiums = await db
    .select({
      id: condominiums.id,
      slug: condominiums.slug,
      createdAt: condominiums.createdAt,
      updatedAt: condominiums.updatedAt,
    })
    .from(condominiums)
    .where(and(...condominiumConditions))
    .limit(boundedLimit);

  const condominiumUpdates: D1PreparedStatement[] = [];
  for (const item of legacyCondominiums) {
    if (!item.slug) {
      condominiumUpdates.push(
        runtime.DB.prepare(
          "UPDATE condominiums SET slug = ? WHERE id = ? AND slug = ''",
        ).bind(`condominio-${item.id}`, item.id),
      );
    }
    if (!item.updatedAt) {
      condominiumUpdates.push(
        runtime.DB.prepare(
          "UPDATE condominiums SET updated_at = ? WHERE id = ? AND updated_at = ''",
        ).bind(item.createdAt, item.id),
      );
    }
  }
  await runBatches(runtime.DB, condominiumUpdates);

  const packageConditions: SQL[] = [
    isNull(packages.photoExpiresAt),
    ne(packages.photoKey, ""),
  ];
  if (condominiumId) {
    packageConditions.push(eq(packages.condominiumId, condominiumId));
  }
  const legacyPackages = await db
    .select({
      id: packages.id,
      receivedAt: packages.receivedAt,
      retentionDays: condominiums.photoRetentionDays,
    })
    .from(packages)
    .innerJoin(condominiums, eq(packages.condominiumId, condominiums.id))
    .where(and(...packageConditions))
    .limit(boundedLimit);
  const packageUpdates = legacyPackages.map((item) =>
    runtime.DB!.prepare(
      "UPDATE packages SET photo_expires_at = ? WHERE id = ? AND photo_expires_at IS NULL",
    ).bind(
      expiryDate(item.retentionDays, parseStoredDate(item.receivedAt)),
      item.id,
    ),
  );
  await runBatches(runtime.DB, packageUpdates);

  return {
    condominiums: legacyCondominiums.length,
    packageExpirations: legacyPackages.length,
  };
}

/**
 * Converte códigos criados por versões antigas para AES-GCM + HMAC. Códigos de
 * encomendas já retiradas são eliminados, pois não têm mais finalidade.
 */
export async function migrateLegacyPickupCodes(
  condominiumId?: number,
  limit = 100,
  override?: SecurityMigrationEnv,
) {
  const runtime = override ?? (env as unknown as SecurityMigrationEnv);
  if (!runtime.DB) throw new Error("D1 indisponível para migrar códigos legados.");
  const db = createDb(runtime.DB);
  const conditions = [ne(packages.pickupCode, "")];
  if (condominiumId) {
    conditions.push(eq(packages.condominiumId, condominiumId));
  }
  const legacy = await db
    .select({
      id: packages.id,
      status: packages.status,
      pickupCode: packages.pickupCode,
      idempotencyKey: packages.idempotencyKey,
    })
    .from(packages)
    .where(and(...conditions))
    .limit(Math.max(1, Math.min(limit, 500)));

  let protectedCount = 0;
  let discardedCount = 0;
  const errors: string[] = [];
  for (const item of legacy) {
    try {
      if (item.status === "withdrawn" || !/^\d{6}$/.test(item.pickupCode)) {
        await db
          .update(packages)
          .set({
            pickupCode: "",
            pickupCodeEncrypted: "",
            pickupCodeHash: "",
          })
          .where(and(eq(packages.id, item.id), ne(packages.pickupCode, "")));
        discardedCount += 1;
        continue;
      }

      const context = item.idempotencyKey || `legacy-package-${item.id}`;
      const protectedCode = await protectPickupCode(
        item.pickupCode,
        context,
        runtime.PICKUP_CODE_SECRET,
      );
      await db
        .update(packages)
        .set({
          idempotencyKey: context,
          pickupCode: "",
          pickupCodeEncrypted: protectedCode.encrypted,
          pickupCodeHash: protectedCode.hash,
        })
        .where(and(eq(packages.id, item.id), ne(packages.pickupCode, "")));
      protectedCount += 1;
    } catch (error) {
      errors.push(
        `#${item.id}: ${error instanceof Error ? error.message : "falha"}`,
      );
    }
  }

  return {
    inspected: legacy.length,
    protected: protectedCount,
    discarded: discardedCount,
    errors: errors.slice(0, 20),
  };
}
