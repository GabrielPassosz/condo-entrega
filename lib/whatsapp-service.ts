import { env } from "cloudflare:workers";

export type WhatsappProvider = "cloud_api" | "baileys" | "disabled";

export type WhatsappRuntimeEnv = {
  WHATSAPP_PROVIDER?: string;
  ALLOW_LEGACY_BAILEYS?: string;
  WHATSAPP_SERVICE_URL?: string;
  WHATSAPP_SERVICE_TOKEN?: string;
  WHATSAPP_CLOUD_API_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_GRAPH_API_VERSION?: string;
  WHATSAPP_TEMPLATE_NAME?: string;
  WHATSAPP_TEMPLATE_LANGUAGE?: string;
  WHATSAPP_REQUEST_TIMEOUT_MS?: string;
};

function runtimeEnv(override?: WhatsappRuntimeEnv) {
  return override ?? (env as unknown as WhatsappRuntimeEnv);
}

export function whatsappProvider(
  override?: WhatsappRuntimeEnv,
): WhatsappProvider {
  const runtime = runtimeEnv(override);
  const requested = runtime.WHATSAPP_PROVIDER?.trim().toLowerCase();
  if (requested === "cloud_api") return requested;
  if (
    requested === "baileys" &&
    runtime.ALLOW_LEGACY_BAILEYS?.trim().toLowerCase() === "true"
  ) {
    return "baileys";
  }
  if (requested === "disabled") return "disabled";
  if (
    runtime.WHATSAPP_CLOUD_API_TOKEN?.trim() &&
    runtime.WHATSAPP_PHONE_NUMBER_ID?.trim()
  ) {
    return "cloud_api";
  }
  return "disabled";
}

export function whatsappConfigured(override?: WhatsappRuntimeEnv) {
  const runtime = runtimeEnv(override);
  const provider = whatsappProvider(runtime);
  if (provider === "cloud_api") {
    return Boolean(
      runtime.WHATSAPP_CLOUD_API_TOKEN?.trim() &&
        runtime.WHATSAPP_PHONE_NUMBER_ID?.trim() &&
        runtime.WHATSAPP_GRAPH_API_VERSION?.trim() &&
        runtime.WHATSAPP_TEMPLATE_NAME?.trim() &&
        runtime.WHATSAPP_TEMPLATE_LANGUAGE?.trim(),
    );
  }
  if (provider === "baileys") {
    return Boolean(
      runtime.WHATSAPP_SERVICE_URL?.trim() &&
        runtime.WHATSAPP_SERVICE_TOKEN?.trim(),
    );
  }
  return false;
}

function requestTimeout(runtime: WhatsappRuntimeEnv) {
  const configured = Number(runtime.WHATSAPP_REQUEST_TIMEOUT_MS);
  return Number.isFinite(configured)
    ? Math.max(2_000, Math.min(configured, 30_000))
    : 10_000;
}

async function readPayload(response: Response) {
  return (await response.json().catch(() => ({}))) as {
    error?: { message?: string } | string;
    erro?: string;
    id?: string;
    messages?: { id?: string }[];
  };
}

async function checkedFetch(
  url: string,
  init: RequestInit,
  runtime: WhatsappRuntimeEnv,
) {
  const response = await fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(requestTimeout(runtime)),
  });
  const payload = await readPayload(response);
  if (!response.ok) {
    const providerMessage =
      typeof payload.error === "string"
        ? payload.error
        : payload.error?.message || payload.erro;
    throw new Error(
      providerMessage || `Provedor de WhatsApp respondeu ${response.status}.`,
    );
  }
  return payload;
}

export async function callWhatsapp<T>(
  path: string,
  init: RequestInit = {},
  override?: WhatsappRuntimeEnv,
): Promise<T> {
  const runtime = runtimeEnv(override);
  const baseUrl = runtime.WHATSAPP_SERVICE_URL?.trim().replace(/\/$/, "");
  const token = runtime.WHATSAPP_SERVICE_TOKEN?.trim();
  if (whatsappProvider(runtime) !== "baileys" || !baseUrl || !token) {
    throw new Error("Serviço Baileys não está habilitado.");
  }

  const payload = await checkedFetch(
    `${baseUrl}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    },
    runtime,
  );
  return payload as T;
}

export function buildPackageMessage(input: {
  residentName: string;
  condominiumName: string;
  description: string;
  pickupCode: string;
}) {
  return [
    `Olá, ${input.residentName}! 📦`,
    "",
    `Uma encomenda chegou à portaria do ${input.condominiumName}.`,
    `Descrição: ${input.description || "encomenda registrada pela portaria"}.`,
    "",
    `Código para retirada: *${input.pickupCode}*`,
    "Apresente este código ao porteiro. Não compartilhe com outras pessoas.",
  ].join("\n");
}

export async function sendPackageWhatsapp(
  input: {
    phone: string;
    residentName: string;
    condominiumName: string;
    description: string;
    pickupCode: string;
    photoBytes: Uint8Array;
    photoMime: string;
    idempotencyKey: string;
    callbackData: string;
  },
  override?: WhatsappRuntimeEnv,
) {
  const runtime = runtimeEnv(override);
  const provider = whatsappProvider(runtime);
  if (!whatsappConfigured(runtime)) {
    throw new Error("Provedor oficial do WhatsApp ainda não foi configurado.");
  }

  if (provider === "baileys") {
    const response = await callWhatsapp<{ ok: boolean; messageId?: string }>(
      "/send",
      {
        method: "POST",
        body: JSON.stringify({
          telefone: input.phone,
          mensagem: buildPackageMessage(input),
          foto_base64: bytesToBase64(input.photoBytes),
          foto_mime: input.photoMime,
          idempotency_key: input.idempotencyKey,
        }),
      },
      runtime,
    );
    return { provider, messageId: response.messageId ?? "" };
  }

  if (provider !== "cloud_api") {
    throw new Error("Envio de WhatsApp está desativado.");
  }
  const token = runtime.WHATSAPP_CLOUD_API_TOKEN!.trim();
  const phoneNumberId = runtime.WHATSAPP_PHONE_NUMBER_ID!.trim();
  const graphVersion = runtime.WHATSAPP_GRAPH_API_VERSION!.trim();
  if (!/^v\d+\.\d+$/.test(graphVersion)) {
    throw new Error("WHATSAPP_GRAPH_API_VERSION é inválida.");
  }
  const baseUrl = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}`;
  const mediaForm = new FormData();
  const photoBuffer = new Uint8Array(input.photoBytes.byteLength);
  photoBuffer.set(input.photoBytes);
  mediaForm.set("messaging_product", "whatsapp");
  mediaForm.set(
    "file",
    new Blob([photoBuffer.buffer], { type: input.photoMime }),
    "encomenda.jpg",
  );
  const media = await checkedFetch(
    `${baseUrl}/media`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: mediaForm,
    },
    runtime,
  );
  if (!media.id) throw new Error("A Meta não retornou o identificador da foto.");

  const destination = String(input.phone).replace(/\D/g, "");
  const message = await checkedFetch(
    `${baseUrl}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: destination,
        type: "template",
        biz_opaque_callback_data: input.callbackData.slice(0, 512),
        template: {
          name: runtime.WHATSAPP_TEMPLATE_NAME!.trim(),
          language: {
            code: runtime.WHATSAPP_TEMPLATE_LANGUAGE!.trim(),
          },
          components: [
            {
              type: "header",
              parameters: [{ type: "image", image: { id: media.id } }],
            },
            {
              type: "body",
              parameters: [
                { type: "text", text: input.residentName },
                { type: "text", text: input.condominiumName },
                {
                  type: "text",
                  text:
                    input.description || "encomenda registrada pela portaria",
                },
                { type: "text", text: input.pickupCode },
              ],
            },
          ],
        },
      }),
    },
    runtime,
  );
  return { provider, messageId: message.messages?.[0]?.id ?? "" };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}
