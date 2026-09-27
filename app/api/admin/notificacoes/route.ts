import { apiError, requireSameOrigin } from "../../../../lib/api";
import { writeAudit } from "../../../../lib/audit";
import { getActor, requireRole } from "../../../../lib/auth";
import { processDueNotificationJobs } from "../../../../lib/notifications";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await getActor();
    requireRole(actor, ["admin"]);
    const results = await processDueNotificationJobs(
      25,
      undefined,
      actor.condominiumId,
    );
    await writeAudit(
      actor,
      "notification_queue.processed",
      "condominium",
      actor.condominiumId,
      { processed: results.length },
    );
    return Response.json({ processed: results.length, results });
  } catch (error) {
    return apiError(error);
  }
}
