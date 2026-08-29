import { apiError, readJson } from "../../../../lib/api";
import { getActor, requireRole } from "../../../../lib/auth";
import { callWhatsapp } from "../../../../lib/whatsapp-service";

export async function POST(request: Request) {
  try {
    const actor = await getActor();
    requireRole(actor, ["admin"]);
    const payload = await readJson<{ phone?: string }>(request);
    const response = await callWhatsapp<Record<string, unknown>>("/pairing-code", {
      method: "POST",
      body: JSON.stringify({ phone: payload.phone }),
    });
    return Response.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
