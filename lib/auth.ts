import { and, asc, eq, or, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { getChatGPTUser, type ChatGPTUser } from "../app/chatgpt-auth";
import { getDb } from "../db";
import { condominiums, profiles, residents } from "../db/schema";
import { ApiError } from "./api";
import { normalizeEmail, safeText } from "./normalize";

export type ActorRole = "admin" | "porter" | "resident";

export type Actor = {
  id: number;
  condominiumId: number;
  residentId: number | null;
  userId: string;
  email: string;
  displayName: string;
  role: ActorRole;
};

export type CondominiumMembership = {
  condominiumId: number;
  condominiumName: string;
  condominiumSlug: string;
  profileId: number;
  role: ActorRole;
};

export const SELECTED_CONDOMINIUM_COOKIE = "condo_entrega_condominium";

type RuntimeEnv = {
  CONDOMINIUM_NAME?: string;
  INITIAL_ADMIN_EMAILS?: string;
};

function configuredCondominiumName() {
  const runtime = env as unknown as RuntimeEnv;
  return safeText(runtime.CONDOMINIUM_NAME, 160) || "Residencial Exemplo";
}

function initialAdminEmails() {
  const runtime = env as unknown as RuntimeEnv;
  return new Set(
    String(runtime.INITIAL_ADMIN_EMAILS ?? "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean),
  );
}

export function condominiumSlug(value: string) {
  const base = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return base || "condominio";
}

async function bindInvitedProfiles(user: ChatGPTUser) {
  const db = getDb();
  const email = normalizeEmail(user.email);
  await db
    .update(profiles)
    .set({
      userId: user.id,
      displayName: safeText(user.displayName, 160) || email,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(profiles.email, email),
        eq(profiles.userId, ""),
        eq(profiles.active, true),
      ),
    );
}

async function provisionResidentMemberships(user: ChatGPTUser) {
  const db = getDb();
  const email = normalizeEmail(user.email);
  const linkedResidents = await db
    .select({
      condominiumId: residents.condominiumId,
      residentId: residents.id,
      name: residents.name,
    })
    .from(residents)
    .innerJoin(
      condominiums,
      and(
        eq(condominiums.id, residents.condominiumId),
        eq(condominiums.active, true),
      ),
    )
    .where(and(eq(residents.email, email), eq(residents.active, true)));

  const residentsPerCondominium = new Map<number, number>();
  const inserts = [];
  for (const resident of linkedResidents) {
    residentsPerCondominium.set(
      resident.condominiumId,
      (residentsPerCondominium.get(resident.condominiumId) ?? 0) + 1,
    );
  }
  for (const resident of linkedResidents) {
    // E-mails duplicados no mesmo condomínio são ambíguos. Nesse caso, o
    // administrador precisa vincular explicitamente o cadastro correto.
    if (residentsPerCondominium.get(resident.condominiumId) !== 1) continue;
    inserts.push(
      db
        .insert(profiles)
        .values({
          condominiumId: resident.condominiumId,
          residentId: resident.residentId,
          userId: user.id,
          email,
          displayName: safeText(user.displayName || resident.name, 160),
          role: "resident",
        })
        .onConflictDoNothing({
          target: [profiles.condominiumId, profiles.email],
        }),
    );
  }
  const [first, ...rest] = inserts;
  if (first) {
    await db.batch([first, ...rest]);
  }
}

async function provisionInitialAdmin(user: ChatGPTUser) {
  const email = normalizeEmail(user.email);
  if (!initialAdminEmails().has(email)) return;

  const db = getDb();
  const [condominium] = await db
    .select()
    .from(condominiums)
    .orderBy(asc(condominiums.id))
    .limit(1);

  // A allowlist serve apenas para tomar posse de um banco realmente vazio.
  // Depois da instalação inicial, novos administradores precisam ser convidados.
  if (condominium) return;

  const name = configuredCondominiumName();
  const slug = `${condominiumSlug(name)}-principal`;
  const now = new Date().toISOString();
  try {
    await db.batch([
      db.insert(condominiums).values({
        name,
        slug,
        createdBy: user.id,
        updatedAt: now,
      }),
      db.insert(profiles).values({
        condominiumId: sql<number>`(
          SELECT ${condominiums.id}
          FROM ${condominiums}
          WHERE ${condominiums.slug} = ${slug}
          LIMIT 1
        )`,
        userId: user.id,
        email,
        displayName: safeText(user.displayName, 160) || email,
        role: "admin",
        updatedAt: now,
      }),
    ]);
  } catch (error) {
    // Duas pessoas da allowlist podem chegar ao mesmo tempo. A restrição do
    // slug garante um único vencedor; a outra requisição segue sem privilégios.
    const [winner] = await db
      .select({ id: condominiums.id })
      .from(condominiums)
      .where(eq(condominiums.slug, slug))
      .limit(1);
    if (!winner) throw error;
  }
}

async function loadMemberships(user: ChatGPTUser) {
  const email = normalizeEmail(user.email);
  return getDb()
    .select({
      profile: profiles,
      condominiumId: condominiums.id,
      condominiumName: condominiums.name,
      condominiumSlug: condominiums.slug,
    })
    .from(profiles)
    .innerJoin(condominiums, eq(condominiums.id, profiles.condominiumId))
    .where(
      and(
        or(
          eq(profiles.userId, user.id),
          and(eq(profiles.userId, ""), eq(profiles.email, email)),
        ),
        eq(profiles.active, true),
        eq(condominiums.active, true),
      ),
    )
    .orderBy(asc(condominiums.name), asc(profiles.id));
}

export async function getActorContext(): Promise<{
  actor: Actor;
  memberships: CondominiumMembership[];
}> {
  const user = await getChatGPTUser();
  if (!user) throw new ApiError(401, "Entre na plataforma para continuar.");

  await bindInvitedProfiles(user);
  await provisionResidentMemberships(user);
  let rows = await loadMemberships(user);
  if (!rows.length) {
    await provisionInitialAdmin(user);
    rows = await loadMemberships(user);
  }

  if (!rows.length) {
    throw new ApiError(
      403,
      "Seu acesso ainda não foi vinculado. Peça a um administrador para cadastrar seu e-mail.",
    );
  }

  const cookieStore = await cookies();
  const selectedId = Number(
    cookieStore.get(SELECTED_CONDOMINIUM_COOKIE)?.value,
  );
  const selected =
    rows.find((row) => row.condominiumId === selectedId) ?? rows[0];
  const profile = selected.profile;

  return {
    actor: {
      id: profile.id,
      condominiumId: selected.condominiumId,
      residentId: profile.residentId,
      userId: user.id,
      email: normalizeEmail(user.email),
      displayName: profile.displayName,
      role: profile.role as ActorRole,
    },
    memberships: rows.map((row) => ({
      condominiumId: row.condominiumId,
      condominiumName: row.condominiumName,
      condominiumSlug: row.condominiumSlug,
      profileId: row.profile.id,
      role: row.profile.role as ActorRole,
    })),
  };
}

export async function getActor(): Promise<Actor> {
  return (await getActorContext()).actor;
}

export async function selectCondominium(condominiumId: number) {
  const { memberships } = await getActorContext();
  if (!memberships.some((item) => item.condominiumId === condominiumId)) {
    throw new ApiError(403, "Você não possui acesso a este condomínio.");
  }
  const cookieStore = await cookies();
  cookieStore.set(SELECTED_CONDOMINIUM_COOKIE, String(condominiumId), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export function requireRole(actor: Actor, roles: ActorRole[]) {
  if (!roles.includes(actor.role)) {
    throw new ApiError(403, "Você não tem permissão para realizar esta ação.");
  }
}
