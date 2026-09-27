import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import {
  messageLogs,
  notificationJobs,
  packages,
} from "../../../../db/schema";

type RuntimeEnv = {
  WHATSAPP_WEBHOOK_VERIFY_TOKEN?: string;
  WHATSAPP_APP_SECRET?: string;
};

function runtime() {
  return env as unknown as RuntimeEnv;
}

function hexBytes(value: string) {
  if (!/^[a-f0-9]+$/i.test(value) || value.length % 2) return null;
  return Uint8Array.from(
    value.match(/.{2}/g) ?? [],
    (part) => Number.parseInt(part, 16),
  );
}

async function validSignature(body: string, signatureHeader: string | null) {
  const appSecret = runtime().WHATSAPP_APP_SECRET ?? "";
  const signature = signatureHeader?.replace(/^sha256=/, "") ?? "";
  const bytes = hexBytes(signature);
  if (appSecret.length < 16 || !bytes) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    bytes,
    new TextEncoder().encode(body),
  );
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const expected = runtime().WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? "";
  if (
    expected.length >= 16 &&
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === expected
  ) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const body = await request.text();
  if (!(await validSignature(body, request.headers.get("x-hub-signature-256")))) {
    return new Response("Invalid signature", { status: 401 });
  }
  const payload = JSON.parse(body) as {
    entry?: {
      changes?: {
        value?: {
          statuses?: {
            id?: string;
            status?: string;
            biz_opaque_callback_data?: string;
            errors?: { title?: string; message?: string }[];
          }[];
        };
      }[];
    }[];
  };
  const statuses =
    payload.entry?.flatMap(
      (entry) =>
        entry.changes?.flatMap((change) => change.value?.statuses ?? []) ?? [],
    ) ?? [];
  const db = getDb();
  for (const status of statuses) {
    if (!status.id) continue;
    const normalized = ["sent", "delivered", "read", "failed"].includes(
      status.status ?? "",
    )
      ? status.status!
      : "sent";
    const error = (status.errors?.[0]?.message || status.errors?.[0]?.title || "")
      .slice(0, 500);
    let [item] = await db
      .select({ id: packages.id })
      .from(packages)
      .where(eq(packages.whatsappMessageId, status.id))
      .limit(1);
    if (!item && status.biz_opaque_callback_data) {
      const match = status.biz_opaque_callback_data.match(/^(\d+):(\d+)$/);
      if (match) {
        const condominiumId = Number(match[1]);
        const packageId = Number(match[2]);
        [item] = await db
          .select({ id: packages.id })
          .from(packages)
          .where(
            and(
              eq(packages.id, packageId),
              eq(packages.condominiumId, condominiumId),
            ),
          )
          .limit(1);
      }
    }
    if (!item) continue;
    await db.batch([
      db
        .update(packages)
        .set({
          notificationStatus: normalized as
            | "sent"
            | "delivered"
            | "read"
            | "failed",
          notificationError: error,
          whatsappMessageId: status.id,
        })
        .where(eq(packages.id, item.id)),
      db
        .update(notificationJobs)
        .set({
          status: normalized === "failed" ? "failed" : "completed",
          lockedAt: null,
          lastError: error,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(notificationJobs.packageId, item.id)),
      db.insert(messageLogs).values({
        packageId: item.id,
        status: normalized,
        remoteId: status.id,
        error,
      }),
    ]);
  }
  return Response.json({ received: true });
}
