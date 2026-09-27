import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { profiles, residents } from "../../../db/schema";
import {
  ApiError,
  apiError,
  readJson,
  requireSameOrigin,
} from "../../../lib/api";
import { writeAudit } from "../../../lib/audit";
import { ActorRole, getActor, requireRole } from "../../../lib/auth";
import { normalizeEmail, safeText } from "../../../lib/normalize";

export async function GET() {
  try {
    const actor = await getActor();
    requireRole(actor, ["admin"]);
    const rows = await getDb()
      .select({
        id: profiles.id,
        condominiumId: profiles.condominiumId,
        residentId: profiles.residentId,
        email: profiles.email,
        displayName: profiles.displayName,
        role: profiles.role,
        active: profiles.active,
        createdAt: profiles.createdAt,
        updatedAt: profiles.updatedAt,
      })
      .from(profiles)
      .where(eq(profiles.condominiumId, actor.condominiumId))
      .orderBy(asc(profiles.role), asc(profiles.displayName));
    return Response.json({ profiles: rows });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await getActor();
    requireRole(actor, ["admin"]);
    const payload = await readJson<{
      email?: string;
      displayName?: string;
      role?: ActorRole;
      residentId?: number | null;
    }>(request);
    const email = normalizeEmail(payload.email);
    const displayName = safeText(payload.displayName, 160);
    const role = payload.role;
    if (!email.includes("@") || !displayName || !role) {
      throw new ApiError(400, "Informe nome, e-mail e tipo de acesso.");
    }
    if (!["admin", "porter", "resident"].includes(role)) {
      throw new ApiError(400, "Tipo de acesso inválido.");
    }

    let residentId: number | null = null;
    if (role === "resident") {
      residentId = Number(payload.residentId) || null;
      const [resident] = residentId
        ? await getDb()
            .select({ id: residents.id })
            .from(residents)
            .where(
              and(
                eq(residents.id, residentId),
                eq(residents.condominiumId, actor.condominiumId),
                eq(residents.active, true),
              ),
            )
            .limit(1)
        : [];
      if (!resident) throw new ApiError(400, "Selecione o morador deste acesso.");
    }

    const values = {
      condominiumId: actor.condominiumId,
      residentId,
      email,
      displayName,
      role,
      active: true,
      updatedAt: new Date().toISOString(),
    };
    const [profile] = await getDb()
      .insert(profiles)
      .values(values)
      .onConflictDoUpdate({
        target: [profiles.condominiumId, profiles.email],
        set: values,
      })
      .returning();
    await writeAudit(actor, "profile.created_or_updated", "profile", profile.id, {
      role: profile.role,
      active: profile.active,
    });
    return Response.json(
      {
        profile: {
          id: profile.id,
          condominiumId: profile.condominiumId,
          residentId: profile.residentId,
          email: profile.email,
          displayName: profile.displayName,
          role: profile.role,
          active: profile.active,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
