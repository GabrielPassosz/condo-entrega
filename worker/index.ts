/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import {
  processDueNotificationJobs,
  processNotificationJob,
  type NotificationQueueMessage,
} from "../lib/notifications";
import {
  purgeExpiredPhotos,
  purgeOrphanedPhotos,
} from "../lib/retention";
import {
  backfillLegacyMetadata,
  migrateLegacyPickupCodes,
} from "../lib/security-migration";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  BUCKET: R2Bucket;
  NOTIFICATION_QUEUE?: Queue<NotificationQueueMessage>;
  PICKUP_CODE_SECRET?: string;
  WHATSAPP_PROVIDER?: string;
  ALLOW_LEGACY_BAILEYS?: string;
  WHATSAPP_CLOUD_API_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_GRAPH_API_VERSION?: string;
  WHATSAPP_TEMPLATE_NAME?: string;
  WHATSAPP_TEMPLATE_LANGUAGE?: string;
  WHATSAPP_REQUEST_TIMEOUT_MS?: string;
  WHATSAPP_WEBHOOK_VERIFY_TOKEN?: string;
  WHATSAPP_APP_SECRET?: string;
  WHATSAPP_SERVICE_URL?: string;
  WHATSAPP_SERVICE_TOKEN?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
  async queue(
    batch: MessageBatch<NotificationQueueMessage>,
    env: Env,
  ): Promise<void> {
    for (const message of batch.messages) {
      const result = await processNotificationJob(message.body.jobId, env);
      if (result.status === "failed") {
        message.retry({ delaySeconds: 60 });
      } else {
        message.ack();
      }
    }
  },
  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(processDueNotificationJobs(25, env));
    ctx.waitUntil((async () => {
      await backfillLegacyMetadata(undefined, 250, env);
      await Promise.all([
        purgeExpiredPhotos(undefined, 250, env),
        purgeOrphanedPhotos(undefined, 500, 24, env),
        migrateLegacyPickupCodes(undefined, 250, env),
      ]);
    })());
  },
};

export default worker;
