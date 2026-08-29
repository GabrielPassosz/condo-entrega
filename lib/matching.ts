import { normalizeText } from "./normalize";

export type ResidentForMatch = {
  id: number;
  name: string;
  unit: string;
  block: string;
  apartment: string;
  normalizedName: string;
  normalizedUnit: string;
};

export type ExtractedLabel = {
  nameHint: string;
  block: string;
  apartment: string;
  unitHint: string;
};

export function extractLabelFields(text: string): ExtractedLabel {
  const originalLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const normalized = normalizeText(text);

  const block =
    normalized.match(/\b(?:bloco|bl|quadra)\s*([a-z0-9]{1,8})\b/)?.[1] ?? "";
  const apartment =
    normalized.match(
      /\b(?:apto|apt|apartamento|unidade|casa)\s*([a-z0-9-]{1,12})\b/,
    )?.[1] ?? "";

  const ignored = /(rua|avenida|av\.|cep|cnpj|cpf|telefone|fone|rastreio|pedido|nota|transportadora|remetente|bloco|apto|apartamento|unidade|casa)/i;
  const nameHint =
    originalLines.find((line) => {
      const words = line.match(/[A-Za-zÀ-ÿ]{2,}/g) ?? [];
      return words.length >= 2 && words.length <= 6 && !ignored.test(line);
    }) ?? "";

  const unitHint = [apartment ? `unidade ${apartment}` : "", block ? `bloco ${block}` : ""]
    .filter(Boolean)
    .join(" ");

  return { nameHint, block, apartment, unitHint };
}

function tokenScore(left: string, right: string) {
  const a = new Set(normalizeText(left).split(" ").filter(Boolean));
  const b = new Set(normalizeText(right).split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return (2 * intersection) / (a.size + b.size);
}

export function rankResidents(
  residentsList: ResidentForMatch[],
  scanText: string,
  extracted = extractLabelFields(scanText),
) {
  const normalizedScan = normalizeText(scanText);

  return residentsList
    .map((resident) => {
      const nameExact =
        resident.normalizedName.length >= 5 &&
        normalizedScan.includes(resident.normalizedName);
      const unitExact =
        resident.normalizedUnit.length >= 2 &&
        normalizedScan.includes(resident.normalizedUnit);
      const blockMatch =
        extracted.block &&
        normalizeText(resident.block) === normalizeText(extracted.block);
      const apartmentMatch =
        extracted.apartment &&
        normalizeText(resident.apartment || resident.unit).includes(
          normalizeText(extracted.apartment),
        );

      const nameSimilarity = tokenScore(extracted.nameHint, resident.name);
      const unitSimilarity = tokenScore(extracted.unitHint, resident.unit);
      let score = nameSimilarity * 45 + unitSimilarity * 20;
      if (nameExact) score += 35;
      if (unitExact) score += 30;
      if (blockMatch) score += 15;
      if (apartmentMatch) score += 25;

      return {
        ...resident,
        score: Math.min(100, Math.round(score)),
        reasons: [
          nameExact || nameSimilarity >= 0.65 ? "nome" : "",
          unitExact || apartmentMatch ? "unidade" : "",
          blockMatch ? "bloco" : "",
        ].filter(Boolean),
      };
    })
    .filter((resident) => resident.score >= 15)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
