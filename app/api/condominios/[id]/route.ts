import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { condominiums, packages } from "../../../../db/schema";
import { apiError, ApiError, readJson, requireSameOrigin } from "../../../../lib/api";
import { writeAudit } from "../../../../lib/audit";
import { getActor, requireRole } from "../../../../lib/auth";
import { safeText } from "../../../../lib/normalize";

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
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
    if (id !== actor.condominiumId) {
      throw new ApiError(403, "Selecione o condomínio antes de alterá-lo.");
    }
    const payload = await readJson<{
      name?: string;
      timezone?: string;
      photoRetentionDays?: number;
    }>(request);
    const name = safeText(payload.name, 160);
    const timezone = safeText(payload.timezone, 80);
    const photoRetentionDays = Number(payload.photoRetentionDays);
    if (!name) throw new ApiError(400, "Informe o nome do condomínio.");
    if (!validTimezone(timezone)) {
      throw new ApiError(400, "Informe um fuso horário IANA válido.");
    }
    if (
      !Number.isInteger(photoRetentionDays) ||
      photoRetentionDays < 1 ||
      photoRetentionDays > 3650
    ) {
      throw new ApiError(400, "A retenção deve ficar entre 1 e 3.650 dias.");
    }

    const db = getDb();
    const condominiumUpdate = db
      .update(condominiums)
      .set({
        name,
        timezone,
        photoRetentionDays,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(condominiums.id, actor.condominiumId),
          eq(condominiums.active, true),
        ),
      );
    const expirationModifier = `+${photoRetentionDays} days`;
    const packageRetentionUpdate = db
      .update(packages)
      .set({
        photoExpiresAt: sql<string>`strftime('%Y-%m-%dT%H:%M:%fZ', ${packages.receivedAt}, ${expirationModifier})`,
      })
      .where(
        and(
          eq(packages.condominiumId, actor.condominiumId),
          ne(packages.photoKey, ""),
        ),
      );
    await db.batch([condominiumUpdate, packageRetentionUpdate]);
    const [updated] = await db
      .select()
      .from(condominiums)
      .where(
        and(
          eq(condominiums.id, actor.condominiumId),
          eq(condominiums.active, true),
        ),
      )
      .limit(1);
    if (!updated) throw new ApiError(404, "Condomínio não encontrado.");
    await writeAudit(actor, "condominium.updated", "condominium", id, {
      timezone,
      photoRetentionDays,
    });
    return Response.json({
      condominium: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        timezone: updated.timezone,
        photoRetentionDays: updated.photoRetentionDays,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
