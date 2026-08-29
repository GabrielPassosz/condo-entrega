import { and, count, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { condominiums, packages, residents } from "../../../db/schema";
import { apiError } from "../../../lib/api";
import { getActor } from "../../../lib/auth";
import { whatsappConfigured } from "../../../lib/whatsapp-service";

export async function GET() {
  try {
    const actor = await getActor();
    const db = getDb();
    const [condominium] = await db
      .select()
      .from(condominiums)
      .where(eq(condominiums.id, actor.condominiumId))
      .limit(1);

    const [[residentCount], [waitingCount], [todayCount], [failedCount]] =
      await Promise.all([
        db
          .select({ value: count() })
          .from(residents)
          .where(
            and(
              eq(residents.condominiumId, actor.condominiumId),
              eq(residents.active, true),
            ),
          ),
        db
          .select({ value: count() })
          .from(packages)
          .where(
            and(
              eq(packages.condominiumId, actor.condominiumId),
              eq(packages.status, "waiting"),
            ),
          ),
        db
          .select({ value: count() })
          .from(packages)
          .where(
            and(
              eq(packages.condominiumId, actor.condominiumId),
              sql`date(${packages.receivedAt}) = date('now')`,
            ),
          ),
        db
          .select({ value: count() })
          .from(packages)
          .where(
            and(
              eq(packages.condominiumId, actor.condominiumId),
              eq(packages.notificationStatus, "failed"),
            ),
          ),
      ]);

    return Response.json({
      actor,
      condominium,
      stats: {
        residents: residentCount.value,
        waiting: waitingCount.value,
        receivedToday: todayCount.value,
        notificationFailures: failedCount.value,
      },
      whatsappConfigured: whatsappConfigured(),
    });
  } catch (error) {
    return apiError(error);
  }
}
