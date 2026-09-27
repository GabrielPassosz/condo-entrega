import { ApiError, apiError } from "../../../../lib/api";
import { getActor, requireRole } from "../../../../lib/auth";
import { writeAudit } from "../../../../lib/audit";
import {
  callWhatsapp,
  whatsappProvider,
} from "../../../../lib/whatsapp-service";

export async function GET() {
  try {
    const actor = await getActor();
    requireRole(actor, ["admin"]);
    if (whatsappProvider() !== "baileys") {
      throw new ApiError(
        409,
        "A API oficial da Meta não utiliza QR Code no portal.",
      );
    }
    const qr = await callWhatsapp<Record<string, unknown>>("/qr");
    await writeAudit(actor, "whatsapp.legacy_qr_viewed", "condominium", actor.condominiumId);
    return Response.json(qr, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
