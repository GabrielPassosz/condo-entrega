const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveBytes(secret: string, purpose: string) {
  return crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`${purpose}:\0:${secret}`),
  );
}

async function encryptionKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    await deriveBytes(secret, "condo-entrega-pickup-encryption-v1"),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

async function signingKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    await deriveBytes(secret, "condo-entrega-pickup-validation-v1"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export function generatePickupCode() {
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  const random = new Uint32Array(1);
  do {
    crypto.getRandomValues(random);
  } while (random[0] >= limit);
  return String(random[0] % 1_000_000).padStart(6, "0");
}

export async function protectPickupCode(
  code: string,
  context: string,
  secret: string,
) {
  if (!/^\d{6}$/.test(code)) throw new Error("Código de retirada inválido.");
  if (secret.length < 32) {
    throw new Error("PICKUP_CODE_SECRET deve ter pelo menos 32 caracteres.");
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = encoder.encode(context);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData },
    await encryptionKey(secret),
    encoder.encode(code),
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(secret),
    encoder.encode(`${context}:${code}`),
  );

  return {
    encrypted: `v1.${bytesToBase64(iv)}.${bytesToBase64(
      new Uint8Array(encrypted),
    )}`,
    hash: `v1.${bytesToBase64(new Uint8Array(signature))}`,
  };
}

export async function revealPickupCode(
  encrypted: string,
  context: string,
  secret: string,
) {
  const [version, ivValue, cipherValue] = encrypted.split(".");
  if (version !== "v1" || !ivValue || !cipherValue) {
    throw new Error("Código protegido inválido.");
  }
  const clear = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(ivValue),
      additionalData: encoder.encode(context),
    },
    await encryptionKey(secret),
    base64ToBytes(cipherValue),
  );
  const code = decoder.decode(clear);
  if (!/^\d{6}$/.test(code)) throw new Error("Código protegido inválido.");
  return code;
}

export async function verifyPickupCode(
  code: string,
  hash: string,
  context: string,
  secret: string,
) {
  const [version, signature] = hash.split(".");
  if (version !== "v1" || !signature || !/^\d{6}$/.test(code)) return false;
  try {
    return crypto.subtle.verify(
      "HMAC",
      await signingKey(secret),
      base64ToBytes(signature),
      encoder.encode(`${context}:${code}`),
    );
  } catch {
    return false;
  }
}
