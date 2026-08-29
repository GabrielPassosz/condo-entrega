export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizePhone(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function composeUnit(input: {
  unit?: unknown;
  block?: unknown;
  apartment?: unknown;
}): string {
  const explicit = String(input.unit ?? "").trim();
  if (explicit) return explicit;
  const block = String(input.block ?? "").trim();
  const apartment = String(input.apartment ?? "").trim();
  return [apartment ? `Unidade ${apartment}` : "", block ? `Bloco ${block}` : ""]
    .filter(Boolean)
    .join(" - ");
}

export function safeText(value: unknown, max = 500): string {
  return String(value ?? "").trim().slice(0, max);
}
