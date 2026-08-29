import { getDb } from "../../../../db";
import { residents } from "../../../../db/schema";
import { ApiError, apiError, readJson } from "../../../../lib/api";
import { getActor, requireRole } from "../../../../lib/auth";
import { residentValues } from "../route";

export async function POST(request: Request) {
  try {
    const actor = await getActor();
    requireRole(actor, ["admin"]);
    const payload = await readJson<{ rows?: Record<string, unknown>[] }>(request);
    if (!Array.isArray(payload.rows) || payload.rows.length === 0) {
      throw new ApiError(400, "A planilha não contém moradores para importar.");
    }
    if (payload.rows.length > 2000) {
      throw new ApiError(400, "Importe no máximo 2.000 moradores por vez.");
    }

    const db = getDb();
    let imported = 0;
    const errors: string[] = [];
    for (const [index, input] of payload.rows.entries()) {
      try {
        const values = residentValues(input, actor.condominiumId);
        await db
          .insert(residents)
          .values(values)
          .onConflictDoUpdate({
            target: [
              residents.condominiumId,
              residents.normalizedName,
              residents.normalizedUnit,
            ],
            set: { ...values, active: true },
          });
        imported += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "linha inválida";
        errors.push(`Linha ${index + 2}: ${message}`);
      }
    }

    return Response.json({ imported, errors: errors.slice(0, 20) });
  } catch (error) {
    return apiError(error);
  }
}
