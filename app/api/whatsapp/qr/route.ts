import { apiError } from "../../../../lib/api";
import { getActor, requireRole } from "../../../../lib/auth";
import { callWhatsapp } from "../../../../lib/whatsapp-service";

export async function GET() {
  try {
    const actor = await getActor();
    requireRole(actor, ["admin"]);
    const qr = await callWhatsapp<Record<string, unknown>>("/qr");
    return Response.json(qr, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
