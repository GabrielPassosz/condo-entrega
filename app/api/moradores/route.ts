import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { residents } from "../../../db/schema";
import { ApiError, apiError, readJson } from "../../../lib/api";
import { getActor, requireRole } from "../../../lib/auth";
import {
  composeUnit,
  normalizeEmail,
  normalizePhone,
  normalizeText,
  safeText,
} from "../../../lib/normalize";

type ResidentInput = {
  unit?: unknown;
  unidade?: unknown;
  block?: unknown;
  bloco?: unknown;
  apartment?: unknown;
  apartamento?: unknown;
  name?: unknown;
  nome?: unknown;
  phone?: unknown;
  telefone?: unknown;
  email?: unknown;
  authorizedPeople?: unknown;
  autorizados?: unknown;
  notes?: unknown;
  observacoes?: unknown;
};

export function residentValues(input: ResidentInput, condominiumId: number) {
  const block = safeText(input.block ?? input.bloco, 30);
  const apartment = safeText(input.apartment ?? input.apartamento, 30);
  const unit = composeUnit({
    unit: input.unit ?? input.unidade,
    block,
    apartment,
  });
  const name = safeText(input.name ?? input.nome, 160);
  const phone = normalizePhone(input.phone ?? input.telefone);
  const email = normalizeEmail(input.email);

  if (!unit || !name || phone.length < 12 || phone.length > 15) {
    throw new ApiError(
      400,
      "Informe unidade, nome e telefone no formato DDI + DDD + número.",
    );
  }

  return {
    condominiumId,
    unit,
    block,
    apartment,
    name,
    phone,
    email,
    authorizedPeople: safeText(
      input.authorizedPeople ?? input.autorizados,
      500,
    ),
    notes: safeText(input.notes ?? input.observacoes, 1000),
    normalizedName: normalizeText(name),
    normalizedUnit: normalizeText(unit),
    updatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const actor = await getActor();
    const db = getDb();
    const condition =
      actor.role === "resident"
        ? and(
            eq(residents.condominiumId, actor.condominiumId),
            eq(residents.id, actor.residentId ?? -1),
            eq(residents.active, true),
          )
        : and(
            eq(residents.condominiumId, actor.condominiumId),
            eq(residents.active, true),
          );
    const rows = await db
      .select()
      .from(residents)
      .where(condition)
      .orderBy(asc(residents.unit), asc(residents.name));
    return Response.json({ residents: rows });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getActor();
    requireRole(actor, ["admin"]);
    const input = await readJson<ResidentInput>(request);
    const values = residentValues(input, actor.condominiumId);
    const db = getDb();
    const [row] = await db
      .insert(residents)
      .values(values)
      .onConflictDoUpdate({
        target: [
          residents.condominiumId,
          residents.normalizedName,
          residents.normalizedUnit,
        ],
        set: { ...values, active: true },
      })
      .returning();
    return Response.json({ resident: row }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
