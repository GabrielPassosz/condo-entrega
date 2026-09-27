import { and, count, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { condominiums, packages, residents } from "../../../db/schema";
import { apiError } from "../../../lib/api";
import { getActorContext } from "../../../lib/auth";
import { localDayRange } from "../../../lib/dates";
import {
  whatsappConfigured,
  whatsappProvider,
} from "../../../lib/whatsapp-service";

export async function GET() {
  try {
    const { actor, memberships } = await getActorContext();
    const db = getDb();
    const [condominium] = await db
      .select({
        id: condominiums.id,
        name: condominiums.name,
        slug: condominiums.slug,
        timezone: condominiums.timezone,
        photoRetentionDays: condominiums.photoRetentionDays,
      })
      .from(condominiums)
      .where(eq(condominiums.id, actor.condominiumId))
      .limit(1);

    const packageScope =
      actor.role === "resident"
        ? and(
            eq(packages.condominiumId, actor.condominiumId),
            eq(packages.residentId, actor.residentId ?? -1),
          )
        : eq(packages.condominiumId, actor.condominiumId);
    const day = localDayRange(condominium?.timezone || "America/Sao_Paulo");
    const [[residentCount], [waitingCount], [todayCount], [failedCount]] =
      await Promise.all([
        db
          .select({ value: count() })
          .from(residents)
          .where(
            and(
              eq(residents.condominiumId, actor.condominiumId),
              eq(residents.active, true),
              ...(actor.role === "resident"
                ? [eq(residents.id, actor.residentId ?? -1)]
                : []),
            ),
          ),
        db
          .select({ value: count() })
          .from(packages)
          .where(
            and(
              packageScope,
              eq(packages.status, "waiting"),
            ),
          ),
        db
          .select({ value: count() })
          .from(packages)
          .where(
            and(
              packageScope,
              sql`datetime(${packages.receivedAt}) >= datetime(${day.start})`,
              sql`datetime(${packages.receivedAt}) < datetime(${day.end})`,
            ),
          ),
        db
          .select({ value: count() })
          .from(packages)
          .where(
            and(
              packageScope,
              eq(packages.notificationStatus, "failed"),
            ),
          ),
      ]);

    return Response.json({
      actor: {
        displayName: actor.displayName,
        role: actor.role,
      },
      condominium,
      memberships: memberships.map((membership) => ({
        condominiumId: membership.condominiumId,
        condominiumName: membership.condominiumName,
        role: membership.role,
      })),
      stats: {
        residents: residentCount.value,
        waiting: waitingCount.value,
        receivedToday: todayCount.value,
        notificationFailures: failedCount.value,
      },
      whatsappConfigured: whatsappConfigured(),
      whatsappProvider: whatsappProvider(),
    });
  } catch (error) {
    return apiError(error);
  }
}
