import assert from "node:assert/strict";
import test from "node:test";
import {
  generatePickupCode,
  protectPickupCode,
  revealPickupCode,
  verifyPickupCode,
} from "../lib/pickup-code-core.ts";

const secret = "teste-local-com-mais-de-trinta-e-dois-caracteres";

test("gera códigos numéricos de seis dígitos", () => {
  const values = Array.from({ length: 100 }, () => generatePickupCode());
  assert.ok(values.every((value) => /^\d{6}$/.test(value)));
  assert.ok(new Set(values).size > 95);
});

test("protege, revela e valida o código sem armazená-lo em claro", async () => {
  const context = "tenant-1-package-42";
  const result = await protectPickupCode("012345", context, secret);

  assert.match(result.encrypted, /^v1\./);
  assert.match(result.hash, /^v1\./);
  assert.equal(result.encrypted.includes("012345"), false);
  assert.equal(result.hash.includes("012345"), false);
  assert.equal(await revealPickupCode(result.encrypted, context, secret), "012345");
  assert.equal(await verifyPickupCode("012345", result.hash, context, secret), true);
  assert.equal(await verifyPickupCode("543210", result.hash, context, secret), false);
});

test("vincula a cifra ao contexto da encomenda", async () => {
  const result = await protectPickupCode("123456", "package-1", secret);
  await assert.rejects(
    revealPickupCode(result.encrypted, "package-2", secret),
  );
});
