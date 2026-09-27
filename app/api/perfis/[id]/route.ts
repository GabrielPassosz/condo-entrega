import { and, eq, sql, type SQL } from "drizzle-orm";
import { getDb } from "../../../../db";
import { profiles, residents } from "../../../../db/schema";
import { apiError, ApiError, readJson, requireSameOrigin } from "../../../../lib/api";
import { writeAudit } from "../../../../lib/audit";
import { type ActorRole, getActor, requireRole } from "../../../../lib/auth";
import { normalizeEmail, safeText } from "../../../../lib/normalize";

function anotherActiveAdmin(condominiumId: number, profileId: number) {
  return sql<boolean>`EXISTS (
    SELECT 1 FROM profiles AS other_admin
    WHERE other_admin.condominium_id = ${condominiumId}
      AND other_admin.id <> ${profileId}
      AND other_admin.role = 'admin'
      AND other_admin.active = 1
  )`;
}

async function targetProfile(id: number, condominiumId: number) {
  const [profile] = await getDb()
    .select()
    .from(profiles)
    .where(
      and(
        eq(profiles.id, id),
        eq(profiles.condominiumId, condominiumId),
      ),
    )
    .limit(1);
  if (!profile) throw new ApiError(404, "Acesso não encontrado.");
  return profile;
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
    const current = await targetProfile(id, actor.condominiumId);
    const payload = await readJson<{
      email?: string;
      displayName?: string;
      role?: ActorRole;
      residentId?: number | null;
      active?: boolean;
    }>(request);
    const email =
      payload.email === undefined ? current.email : normalizeEmail(payload.email);
    const displayName =
      payload.displayName === undefined
        ? current.displayName
        : safeText(payload.displayName, 160);
    const role = payload.role ?? (current.role as ActorRole);
    const active =
      typeof payload.active === "boolean" ? payload.active : current.active;
    if (!email.includes("@") || !displayName) {
      throw new ApiError(400, "Informe nome e e-mail válidos.");
    }
    if (!["admin", "porter", "resident"].includes(role)) {
      throw new ApiError(400, "Tipo de acesso inválido.");
    }
    const protectsLastAdmin =
      current.role === "admin" &&
      current.active &&
      (!active || role !== "admin");

    let residentId: number | null = null;
    if (role === "resident") {
      residentId = Number(payload.residentId ?? current.residentId) || null;
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
      if (!resident) throw new ApiError(400, "Selecione um morador ativo.");
    }

    const updateConditions: SQL[] = [
      eq(profiles.id, id),
      eq(profiles.condominiumId, actor.condominiumId),
    ];
    if (protectsLastAdmin) {
      updateConditions.push(anotherActiveAdmin(actor.condominiumId, id));
    }
    const [updated] = await getDb()
      .update(profiles)
      .set({
        email,
        displayName,
        role,
        residentId,
        active,
        userId: email === current.email ? current.userId : "",
        updatedAt: new Date().toISOString(),
      })
      .where(and(...updateConditions))
      .returning();
    if (!updated) {
      throw new ApiError(
        409,
        "O condomínio precisa manter outro administrador ativo.",
      );
    }
    await writeAudit(actor, "profile.updated", "profile", id, {
      role,
      active,
    });
    return Response.json({
      profile: {
        id: updated.id,
        condominiumId: updated.condominiumId,
        residentId: updated.residentId,
        email: updated.email,
        displayName: updated.displayName,
        role: updated.role,
        active: updated.active,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

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
    const current = await targetProfile(id, actor.condominiumId);
    if (id === actor.id) {
      throw new ApiError(409, "Você não pode excluir o próprio acesso.");
    }
    const deleteConditions: SQL[] = [
      eq(profiles.id, id),
      eq(profiles.condominiumId, actor.condominiumId),
    ];
    if (current.role === "admin" && current.active) {
      deleteConditions.push(anotherActiveAdmin(actor.condominiumId, id));
    }
    const [deleted] = await getDb()
      .delete(profiles)
      .where(and(...deleteConditions))
      .returning({ id: profiles.id });
    if (!deleted) {
      throw new ApiError(
        409,
        "O condomínio precisa manter outro administrador ativo.",
      );
    }
    await writeAudit(actor, "profile.deleted", "profile", id, {
      role: current.role,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
