import { getDb } from "../../../../db";
import { residents } from "../../../../db/schema";
import {
  ApiError,
  apiError,
  readJson,
  requireSameOrigin,
} from "../../../../lib/api";
import { writeAudit } from "../../../../lib/audit";
import { getActor, requireRole } from "../../../../lib/auth";
import { residentValues } from "../route";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
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
    const errors: string[] = [];
    const validRows: ReturnType<typeof residentValues>[] = [];
    for (const [index, input] of payload.rows.entries()) {
      try {
        validRows.push(residentValues(input, actor.condominiumId));
      } catch (error) {
        const message = error instanceof Error ? error.message : "linha inválida";
        errors.push(`Linha ${index + 2}: ${message}`);
      }
    }

    const chunkSize = 50;
    for (let index = 0; index < validRows.length; index += chunkSize) {
      const chunk = validRows.slice(index, index + chunkSize);
      const queries = chunk.map((values) =>
        db
          .insert(residents)
          .values(values)
          .onConflictDoUpdate({
            target: [
              residents.condominiumId,
              residents.normalizedName,
              residents.normalizedUnit,
            ],
            set: { ...values, active: true },
          }),
      );
      const [first, ...rest] = queries;
      if (first) await db.batch([first, ...rest]);
    }

    await writeAudit(actor, "resident.imported", "resident_import", "batch", {
      imported: validRows.length,
      rejected: errors.length,
    });
    return Response.json({
      imported: validRows.length,
      rejected: errors.length,
      errors: errors.slice(0, 20),
    });
  } catch (error) {
    return apiError(error);
  }
}
