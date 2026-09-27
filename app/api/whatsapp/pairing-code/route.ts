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
        "A API oficial da Meta não utiliza código de pareamento.",
      );
    }
    const payload = await readJson<{ phone?: string }>(request);
    const response = await callWhatsapp<Record<string, unknown>>("/pairing-code", {
      method: "POST",
      body: JSON.stringify({ phone: payload.phone }),
    });
    await writeAudit(actor, "whatsapp.legacy_pairing_requested", "condominium", actor.condominiumId);
    return Response.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
