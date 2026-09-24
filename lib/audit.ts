import { getDb } from "../db";
import { auditLogs } from "../db/schema";
import type { Actor } from "./auth";
import { safeText } from "./normalize";

function safeMetadata(value: Record<string, unknown>) {
  const entries = Object.entries(value)
    .slice(0, 20)
    .map(([key, item]) => [
      safeText(key, 80),
      typeof item === "number" || typeof item === "boolean"
        ? item
        : safeText(item, 300),
    ]);
  return JSON.stringify(Object.fromEntries(entries)).slice(0, 4000);
}

export async function writeAudit(
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string | number,
  metadata: Record<string, unknown> = {},
) {
  await getDb().insert(auditLogs).values({
    condominiumId: actor.condominiumId,
    actorProfileId: actor.id,
    actorEmail: actor.email,
    action: safeText(action, 100),
    entityType: safeText(entityType, 80),
    entityId: safeText(entityId, 100),
    metadata: safeMetadata(metadata),
  });
}
