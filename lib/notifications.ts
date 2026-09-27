import { and, eq, lt, ne, or, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { createDb, getDb } from "../db";
import {
  condominiums,
  messageLogs,
  notificationJobs,
  packages,
  residents,
} from "../db/schema";
import {
  protectPickupCode,
  revealPickupCode,
} from "./pickup-code";
import {
  sendPackageWhatsapp,
  type WhatsappRuntimeEnv,
  whatsappConfigured,
} from "./whatsapp-service";

export type NotificationQueueMessage = { jobId: number };
export type NotificationStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "not_configured"
  | "consent_required";

type NotificationRuntimeEnv = WhatsappRuntimeEnv & {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  PICKUP_CODE_SECRET?: string;
  NOTIFICATION_QUEUE?: Queue<NotificationQueueMessage>;
};

function runtimeEnv(override?: NotificationRuntimeEnv) {
  return override ?? (env as unknown as NotificationRuntimeEnv);
}

async function createOrResetJob(packageId: number, condominiumId: number) {
  const db = getDb();
  const [job] = await db
    .insert(notificationJobs)
    .values({ packageId, condominiumId })
    .onConflictDoUpdate({
      target: notificationJobs.packageId,
      set: {
        status: "pending",
        attempts: 0,
        availableAt: new Date().toISOString(),
        lockedAt: null,
        lastError: "",
        updatedAt: new Date().toISOString(),
      },
    })
    .returning();
  return job;
}

export async function enqueuePackageNotification(
  packageId: number,
  condominiumId: number,
) {
  const runtime = runtimeEnv();
  const job = await createOrResetJob(packageId, condominiumId);
  await getDb()
    .update(packages)
    .set({ notificationStatus: "pending", notificationError: "" })
    .where(
      and(
        eq(packages.id, packageId),
        eq(packages.condominiumId, condominiumId),
      ),
    );

  if (runtime.NOTIFICATION_QUEUE) {
    await runtime.NOTIFICATION_QUEUE.send({ jobId: job.id });
    return { status: "pending" as const, error: "" };
  }
  return processNotificationJob(job.id, runtime);
}

function retryDate(attempts: number) {
  const delayMinutes = Math.min(60, 2 ** Math.min(attempts, 6));
  return new Date(Date.now() + delayMinutes * 60_000).toISOString();
}

export async function processNotificationJob(
  jobId: number,
  override?: NotificationRuntimeEnv,
): Promise<{ status: NotificationStatus; error: string }> {
  const runtime = runtimeEnv(override);
  if (!runtime.DB) throw new Error("D1 indisponível para processar notificações.");
  const db = createDb(runtime.DB);
  const staleLock = new Date(Date.now() - 5 * 60_000).toISOString();
  const [claimed] = await db
    .update(notificationJobs)
    .set({
      status: "processing",
      attempts: sql`${notificationJobs.attempts} + 1`,
      lockedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(notificationJobs.id, jobId),
        lt(notificationJobs.attempts, 5),
        or(
          eq(notificationJobs.status, "pending"),
          eq(notificationJobs.status, "failed"),
          and(
            eq(notificationJobs.status, "processing"),
            lt(notificationJobs.lockedAt, staleLock),
          ),
        ),
      ),
    )
    .returning();

  if (!claimed) {
    const [current] = await db
      .select()
      .from(notificationJobs)
      .where(eq(notificationJobs.id, jobId))
      .limit(1);
    return {
      status: current?.status === "completed" ? "sent" : "pending",
      error: current?.lastError ?? "",
    };
  }

  try {
    const [record] = await db
      .select({
        item: packages,
        residentName: residents.name,
        residentPhone: residents.phone,
        whatsappOptInAt: residents.whatsappOptInAt,
        condominiumName: condominiums.name,
      })
      .from(packages)
      .innerJoin(residents, eq(packages.residentId, residents.id))
      .innerJoin(condominiums, eq(packages.condominiumId, condominiums.id))
      .where(
        and(
          eq(packages.id, claimed.packageId),
          eq(packages.condominiumId, claimed.condominiumId),
        ),
      )
      .limit(1);
    if (!record) throw new Error("Encomenda da notificação não foi encontrada.");

    if (["sent", "delivered", "read"].includes(record.item.notificationStatus)) {
      await db
        .update(notificationJobs)
        .set({
          status: "completed",
          lockedAt: null,
          lastError: "",
          updatedAt: new Date().toISOString(),
        })
        .where(eq(notificationJobs.id, claimed.id));
      return {
        status: record.item.notificationStatus as NotificationStatus,
        error: "",
      };
    }

    if (!record.whatsappOptInAt) {
      const message = "O morador ainda não autorizou avisos pelo WhatsApp.";
      await db.batch([
        db
          .update(packages)
          .set({
            notificationStatus: "consent_required",
            notificationError: message,
            notificationAttempts: claimed.attempts,
            lastNotificationAttemptAt: new Date().toISOString(),
          })
          .where(eq(packages.id, record.item.id)),
        db
          .update(notificationJobs)
          .set({
            status: "completed",
            lockedAt: null,
            lastError: message,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(notificationJobs.id, claimed.id)),
        db.insert(messageLogs).values({
          packageId: record.item.id,
          status: "consent_required",
          error: message,
        }),
      ]);
      return { status: "consent_required", error: message };
    }
    if (!whatsappConfigured(runtime)) {
      throw new Error("O provedor de WhatsApp ainda não foi configurado.");
    }
    if (!runtime.BUCKET || !record.item.photoKey) {
      throw new Error("A foto da encomenda não está disponível para envio.");
    }
    const photo = await runtime.BUCKET.get(record.item.photoKey);
    if (!photo) throw new Error("A foto da encomenda não foi encontrada.");
    const photoBytes = new Uint8Array(await photo.arrayBuffer());

    const context =
      record.item.idempotencyKey || `legacy-package-${record.item.id}`;
    let code: string;
    if (record.item.pickupCodeEncrypted) {
      code = await revealPickupCode(
        record.item.pickupCodeEncrypted,
        context,
        runtime.PICKUP_CODE_SECRET,
      );
    } else if (/^\d{6}$/.test(record.item.pickupCode)) {
      code = record.item.pickupCode;
      const protectedCode = await protectPickupCode(
        code,
        context,
        runtime.PICKUP_CODE_SECRET,
      );
      await db
        .update(packages)
        .set({
          idempotencyKey: context,
          pickupCode: "",
          pickupCodeEncrypted: protectedCode.encrypted,
          pickupCodeHash: protectedCode.hash,
        })
        .where(eq(packages.id, record.item.id));
    } else {
      throw new Error("O código protegido da encomenda não está disponível.");
    }

    const sent = await sendPackageWhatsapp(
      {
        phone: record.residentPhone,
        residentName: record.residentName,
        condominiumName: record.condominiumName,
        description: record.item.description,
        pickupCode: code,
        photoBytes,
        photoMime: record.item.photoMime,
        idempotencyKey: context,
        callbackData: `${claimed.condominiumId}:${record.item.id}`,
      },
      runtime,
    );
    const now = new Date().toISOString();
    await db.batch([
      db
        .update(packages)
        .set({
          notificationStatus: "sent",
          notificationError: "",
          notificationAttempts: claimed.attempts,
          lastNotificationAttemptAt: now,
          whatsappMessageId: sent.messageId,
          notifiedAt: now,
        })
        .where(eq(packages.id, record.item.id)),
      db
        .update(notificationJobs)
        .set({
          status: "completed",
          lockedAt: null,
          lastError: "",
          updatedAt: now,
        })
        .where(eq(notificationJobs.id, claimed.id)),
      db.insert(messageLogs).values({
        packageId: record.item.id,
        status: "sent",
        remoteId: sent.messageId,
      }),
    ]);
    return { status: "sent", error: "" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 500) : "Falha no envio.";
    const status: NotificationStatus = whatsappConfigured(runtime)
      ? "failed"
      : "not_configured";
    const now = new Date().toISOString();
    await db.batch([
      db
        .update(packages)
        .set({
          notificationStatus: status,
          notificationError: message,
          notificationAttempts: claimed.attempts,
          lastNotificationAttemptAt: now,
        })
        .where(eq(packages.id, claimed.packageId)),
      db
        .update(notificationJobs)
        .set({
          status: "failed",
          availableAt: retryDate(claimed.attempts),
          lockedAt: null,
          lastError: message,
          updatedAt: now,
        })
        .where(eq(notificationJobs.id, claimed.id)),
      db.insert(messageLogs).values({
        packageId: claimed.packageId,
        status,
        error: message,
      }),
    ]);
    return { status, error: message };
  }
}

export async function processDueNotificationJobs(
  limit = 10,
  override?: NotificationRuntimeEnv,
  condominiumId?: number,
) {
  const runtime = runtimeEnv(override);
  if (!runtime.DB) throw new Error("D1 indisponível para processar notificações.");
  const db = createDb(runtime.DB);
  const dueConditions = [
    ne(notificationJobs.status, "completed"),
    lt(notificationJobs.attempts, 5),
    lt(notificationJobs.availableAt, new Date().toISOString()),
  ];
  if (condominiumId) {
    dueConditions.push(eq(notificationJobs.condominiumId, condominiumId));
  }
  const due = await db
    .select({ id: notificationJobs.id })
    .from(notificationJobs)
    .where(
      and(...dueConditions),
    )
    .limit(Math.max(1, Math.min(limit, 50)));
  const results = [];
  for (const job of due) {
    results.push(await processNotificationJob(job.id, runtime));
  }
  return results;
}
