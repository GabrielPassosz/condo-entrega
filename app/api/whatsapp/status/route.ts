import { apiError } from "../../../../lib/api";
import { getActor, requireRole } from "../../../../lib/auth";
import {
  callWhatsapp,
  whatsappConfigured,
} from "../../../../lib/whatsapp-service";

export async function GET() {
  try {
    const actor = await getActor();
    requireRole(actor, ["admin"]);
    if (!whatsappConfigured()) {
      return Response.json({ configured: false, state: "not_configured" });
    }
    const status = await callWhatsapp<Record<string, unknown>>("/status");
    return Response.json({ configured: true, ...status });
  } catch (error) {
    return apiError(error);
  }
}
