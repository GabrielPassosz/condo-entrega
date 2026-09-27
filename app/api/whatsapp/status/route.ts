import { apiError } from "../../../../lib/api";
import { getActor, requireRole } from "../../../../lib/auth";
import {
  callWhatsapp,
  whatsappConfigured,
  whatsappProvider,
} from "../../../../lib/whatsapp-service";

export async function GET() {
  try {
    const actor = await getActor();
    requireRole(actor, ["admin"]);
    const provider = whatsappProvider();
    if (!whatsappConfigured()) {
      return Response.json({
        configured: false,
        provider,
        state: "not_configured",
      });
    }
    if (provider === "cloud_api") {
      return Response.json({
        configured: true,
        provider,
        state: "connected",
        connected: true,
        official: true,
      });
    }
    const status = await callWhatsapp<Record<string, unknown>>("/status");
    return Response.json({ configured: true, provider, ...status });
  } catch (error) {
    return apiError(error);
  }
}
