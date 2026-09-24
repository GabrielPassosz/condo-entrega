import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { condominiums, profiles } from "../../../db/schema";
import { apiError, ApiError, readJson, requireSameOrigin } from "../../../lib/api";
import { writeAudit } from "../../../lib/audit";
import {
  condominiumSlug,
  getActor,
  requireRole,
  selectCondominium,
} from "../../../lib/auth";
import { safeText } from "../../../lib/normalize";

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await getActor();
    requireRole(actor, ["admin"]);
    const payload = await readJson<{
      name?: string;
      timezone?: string;
      photoRetentionDays?: number;
    }>(request);
    const name = safeText(payload.name, 160);
    const timezone = safeText(payload.timezone, 80) || "America/Sao_Paulo";
    const photoRetentionDays = Number(payload.photoRetentionDays ?? 90);
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
    const slug = `${condominiumSlug(name)}-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    await db.batch([
      db.insert(condominiums).values({
        name,
        slug,
        timezone,
        photoRetentionDays,
        createdBy: actor.userId,
        updatedAt: now,
      }),
      db.insert(profiles).values({
        condominiumId: sql<number>`(
          SELECT ${condominiums.id}
          FROM ${condominiums}
          WHERE ${condominiums.slug} = ${slug}
          LIMIT 1
        )`,
        userId: actor.userId,
        email: actor.email,
        displayName: actor.displayName,
        role: "admin",
        updatedAt: now,
      }),
    ]);
    const [[condominium], [profile]] = await Promise.all([
      db
        .select()
        .from(condominiums)
        .where(eq(condominiums.slug, slug))
        .limit(1),
      db
        .select()
        .from(profiles)
        .innerJoin(condominiums, eq(profiles.condominiumId, condominiums.id))
        .where(eq(condominiums.slug, slug))
        .limit(1)
        .then((rows) => rows.map((row) => row.profiles)),
    ]);
    if (!condominium || !profile) {
      throw new Error("O novo condomínio não foi confirmado pelo banco.");
    }
    const newActor = {
      ...actor,
      id: profile.id,
      condominiumId: condominium.id,
      residentId: null,
    };
    await writeAudit(newActor, "condominium.created", "condominium", condominium.id);
    await selectCondominium(condominium.id);
    return Response.json(
      {
        condominium: {
          id: condominium.id,
          name: condominium.name,
          slug: condominium.slug,
          timezone: condominium.timezone,
          photoRetentionDays: condominium.photoRetentionDays,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
