import { apiError, readJson } from "../../../../lib/api";
import { getActor, requireRole } from "../../../../lib/auth";
import { callWhatsapp } from "../../../../lib/whatsapp-service";

export async function POST(request: Request) {
  try {
    const actor = await getActor();
    requireRole(actor, ["admin"]);
    const payload = await readJson<{ confirmation?: string }>(request);
    const response = await callWhatsapp<Record<string, unknown>>("/reset-session", {
      method: "POST",
      body: JSON.stringify({ confirmation: payload.confirmation }),
    });
    return Response.json(response);
  } catch (error) {
    return apiError(error);
  }
}
