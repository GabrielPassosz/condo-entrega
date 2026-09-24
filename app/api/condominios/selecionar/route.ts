import { apiError, ApiError, readJson, requireSameOrigin } from "../../../../lib/api";
import { selectCondominium } from "../../../../lib/auth";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const payload = await readJson<{ condominiumId?: number }>(request);
    const condominiumId = Number(payload.condominiumId);
    if (!Number.isInteger(condominiumId) || condominiumId <= 0) {
      throw new ApiError(400, "Condomínio inválido.");
    }
    await selectCondominium(condominiumId);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
