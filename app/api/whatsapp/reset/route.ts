import {
  ApiError,
  apiError,
  readJson,
  requireSameOrigin,
} from "../../../../lib/api";
import { getActor, requireRole } from "../../../../lib/auth";
import { writeAudit } from "../../../../lib/audit";
import {
  callWhatsapp,
  whatsappProvider,
} from "../../../../lib/whatsapp-service";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await getActor();
    requireRole(actor, ["admin"]);
    if (whatsappProvider() !== "baileys") {
      throw new ApiError(
        409,
        "A conexão oficial é administrada no Meta Business Manager.",
      );
    }
    const payload = await readJson<{ confirmation?: string }>(request);
    const response = await callWhatsapp<Record<string, unknown>>("/reset-session", {
      method: "POST",
      body: JSON.stringify({ confirmation: payload.confirmation }),
    });
    await writeAudit(actor, "whatsapp.legacy_session_reset", "condominium", actor.condominiumId);
    return Response.json(response);
  } catch (error) {
    return apiError(error);
  }
}
