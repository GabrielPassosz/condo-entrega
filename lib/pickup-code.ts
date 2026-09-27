import { env } from "cloudflare:workers";
import { ApiError } from "./api";
import {
  generatePickupCode,
  protectPickupCode as protect,
  revealPickupCode as reveal,
  verifyPickupCode as verify,
} from "./pickup-code-core";

function pickupSecret(override?: string) {
  const secret = String(
    override ??
      (env as unknown as { PICKUP_CODE_SECRET?: string }).PICKUP_CODE_SECRET ??
      "",
  );
  if (secret.length < 32) {
    throw new ApiError(
      503,
      "A proteção dos códigos de retirada ainda não foi configurada.",
    );
  }
  return secret;
}

export { generatePickupCode };

export function protectPickupCode(code: string, context: string, secret?: string) {
  return protect(code, context, pickupSecret(secret));
}

export function revealPickupCode(encrypted: string, context: string, secret?: string) {
  return reveal(encrypted, context, pickupSecret(secret));
}

export function verifyPickupCode(code: string, hash: string, context: string, secret?: string) {
  return verify(code, hash, context, pickupSecret(secret));
}
