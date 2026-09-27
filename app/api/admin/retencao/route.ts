import { apiError, requireSameOrigin } from "../../../../lib/api";
import { getActor, requireRole } from "../../../../lib/auth";
import {
  purgeExpiredPhotos,
  purgeOrphanedPhotos,
} from "../../../../lib/retention";
import { writeAudit } from "../../../../lib/audit";
import {
  backfillLegacyMetadata,
  migrateLegacyPickupCodes,
} from "../../../../lib/security-migration";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await getActor();
    requireRole(actor, ["admin"]);
    const legacyMetadata = await backfillLegacyMetadata(
      actor.condominiumId,
      250,
    );
    const [result, legacyCodes, orphanedPhotos] = await Promise.all([
      purgeExpiredPhotos(actor.condominiumId, 250),
      migrateLegacyPickupCodes(actor.condominiumId, 250),
      purgeOrphanedPhotos(actor.condominiumId, 500),
    ]);
    await writeAudit(
      actor,
      "retention.executed",
      "condominium",
      actor.condominiumId,
      {
        photosPurged: result.purged,
        codesProtected: legacyCodes.protected,
        obsoleteCodesDiscarded: legacyCodes.discarded,
        expirationsBackfilled: legacyMetadata.packageExpirations,
        orphanedPhotosPurged: orphanedPhotos.purged,
      },
    );
    return Response.json({
      ...result,
      legacyCodes,
      legacyMetadata,
      orphanedPhotos,
    });
  } catch (error) {
    return apiError(error);
  }
}
