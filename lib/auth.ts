import { and, count, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../app/chatgpt-auth";
import { getDb } from "../db";
import { condominiums, profiles, residents } from "../db/schema";
import { ApiError } from "./api";
import { normalizeEmail } from "./normalize";

export type ActorRole = "admin" | "porter" | "resident";

export type Actor = {
  id: number;
  condominiumId: number;
  residentId: number | null;
  email: string;
  displayName: string;
  role: ActorRole;
};

function configuredCondominiumName() {
  const runtime = env as unknown as { CONDOMINIUM_NAME?: string };
  return runtime.CONDOMINIUM_NAME?.trim() || "Residencial Exemplo";
}

export async function getActor(): Promise<Actor> {
  const user = await getChatGPTUser();
  if (!user) throw new ApiError(401, "Entre na plataforma para continuar.");

  const email = normalizeEmail(user.email);
  const db = getDb();
  const existing = await db
    .select()
    .from(profiles)
    .where(eq(profiles.email, email))
    .limit(1);

  if (existing[0]) {
    if (!existing[0].active) throw new ApiError(403, "Este acesso está desativado.");
    return existing[0] as Actor;
  }

  const [{ total }] = await db.select({ total: count() }).from(profiles);
  let condominium = await db.select().from(condominiums).limit(1);
  if (!condominium[0]) {
    condominium = await db
      .insert(condominiums)
      .values({ name: configuredCondominiumName() })
      .returning();
  }

  if (total === 0) {
    const [created] = await db
      .insert(profiles)
      .values({
        condominiumId: condominium[0].id,
        email,
        displayName: user.displayName,
        role: "admin",
      })
      .returning();
    return created as Actor;
  }

  const linkedResident = await db
    .select()
    .from(residents)
    .where(
      and(
        eq(residents.condominiumId, condominium[0].id),
        eq(residents.email, email),
        eq(residents.active, true),
      ),
    )
    .limit(1);

  if (linkedResident[0]) {
    const [created] = await db
      .insert(profiles)
      .values({
        condominiumId: condominium[0].id,
        residentId: linkedResident[0].id,
        email,
        displayName: user.displayName,
        role: "resident",
      })
      .returning();
    return created as Actor;
  }

  throw new ApiError(
    403,
    "Seu e-mail ainda não foi vinculado a um morador ou funcionário.",
  );
}

export function requireRole(actor: Actor, roles: ActorRole[]) {
  if (!roles.includes(actor.role)) {
    throw new ApiError(403, "Você não tem permissão para realizar esta ação.");
  }
}
