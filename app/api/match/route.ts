import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { residents } from "../../../db/schema";
import { ApiError, apiError, readJson } from "../../../lib/api";
import { getActor, requireRole } from "../../../lib/auth";
import { extractLabelFields, rankResidents } from "../../../lib/matching";

export async function POST(request: Request) {
  try {
    const actor = await getActor();
    requireRole(actor, ["admin", "porter"]);
    const payload = await readJson<{ scanText?: string; barcode?: string }>(request);
    const scanText = String(payload.scanText ?? "").trim().slice(0, 12000);
    const barcode = String(payload.barcode ?? "").trim().slice(0, 200);
    if (!scanText && !barcode) {
      throw new ApiError(400, "Leia a etiqueta ou informe os dados manualmente.");
    }

    const list = await getDb()
      .select({
        id: residents.id,
        name: residents.name,
        unit: residents.unit,
        block: residents.block,
        apartment: residents.apartment,
        normalizedName: residents.normalizedName,
        normalizedUnit: residents.normalizedUnit,
      })
      .from(residents)
      .where(
        and(
          eq(residents.condominiumId, actor.condominiumId),
          eq(residents.active, true),
        ),
      );
    const extracted = extractLabelFields(scanText);
    return Response.json({
      extracted,
      barcode,
      candidates: rankResidents(list, scanText, extracted),
    });
  } catch (error) {
    return apiError(error);
  }
}
