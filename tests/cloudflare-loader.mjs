const cloudflareModule =
  "data:text/javascript," +
  encodeURIComponent("export const env = globalThis.__CLOUDFLARE_TEST_ENV__ ?? {};");

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return { url: cloudflareModule, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
