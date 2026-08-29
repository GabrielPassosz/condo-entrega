import { env } from "cloudflare:workers";

type RuntimeEnv = {
  WHATSAPP_SERVICE_URL?: string;
  WHATSAPP_SERVICE_TOKEN?: string;
};

export function whatsappConfigured() {
  const runtime = env as unknown as RuntimeEnv;
  return Boolean(
    runtime.WHATSAPP_SERVICE_URL?.trim() &&
      runtime.WHATSAPP_SERVICE_TOKEN?.trim(),
  );
}

export async function callWhatsapp<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const runtime = env as unknown as RuntimeEnv;
  const baseUrl = runtime.WHATSAPP_SERVICE_URL?.trim().replace(/\/$/, "");
  const token = runtime.WHATSAPP_SERVICE_TOKEN?.trim();
  if (!baseUrl || !token) throw new Error("Serviço WhatsApp ainda não configurado.");

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    erro?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error || payload.erro || `WhatsApp respondeu ${response.status}.`);
  }
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
