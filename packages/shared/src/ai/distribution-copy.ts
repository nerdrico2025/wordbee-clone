import { AiProviderError } from "./errors.js";
import type { GeneratedDistributionCopy } from "./types.js";

/**
 * Parse + validação da resposta de `generateDistributionCopy`, compartilhado
 * pelos 4 provedores de texto (cada um só sabe fazer a chamada HTTP; o
 * formato da resposta é o mesmo para todos, porque o prompt é o mesmo).
 *
 * A resposta é sempre um ARRAY de variações, mesmo quando só uma foi pedida
 * — um formato só, em vez de "objeto quando é uma, array quando são várias",
 * que obrigaria o parser a adivinhar.
 *
 * A validação de link é uma guarda real, não paranoia: o prompt manda o
 * modelo NUNCA escrever URL (o link é anexado pelo código, para não
 * depender do modelo acertar a URL), e um modelo que desobedece produziria
 * um comentário com dois links — um inventado e um certo. Variações
 * individuais com link são descartadas; se NENHUMA sobrar, a chamada falha
 * e o pipeline tenta de novo.
 */
export function parseDistributionCopyResponse(content: string, provider: string): GeneratedDistributionCopy[] {
  const parsed = parseJsonArray(content, provider);

  const validas: GeneratedDistributionCopy[] = [];
  for (const item of parsed) {
    const copy = toCopy(item);
    if (copy) validas.push(copy);
  }

  if (validas.length === 0) {
    throw new AiProviderError("unknown", provider, "nenhuma variação de copy de distribuição utilizável na resposta");
  }
  return validas;
}

function toCopy(item: unknown): GeneratedDistributionCopy | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const obj = item as Record<string, unknown>;

  const copyDescricao = asNonEmptyString(obj.copyDescricao);
  const copyComentario = asNonEmptyString(obj.copyComentario);
  if (!copyDescricao || !copyComentario) return null;
  if (containsUrl(copyDescricao) || containsUrl(copyComentario)) return null;

  const palavraChave = asNonEmptyString(obj.palavraChave)?.toUpperCase() ?? "QUERO";
  return { copyDescricao, copyComentario, palavraChave };
}

/**
 * Aceita tanto um array quanto um objeto solto: modelos mais fracos às
 * vezes devolvem só o objeto quando foi pedida uma variação só, e rejeitar
 * isso seria desperdiçar uma chamada por um detalhe de formato que não muda
 * o conteúdo. Tolerante a cercas ```json, como os outros parsers do projeto.
 */
function parseJsonArray(content: string, provider: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(content));
  } catch {
    throw new AiProviderError("unknown", provider, "resposta da copy de distribuição não é um JSON válido");
  }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") return [parsed];
  throw new AiProviderError("unknown", provider, "resposta da copy de distribuição não é um JSON de array nem de objeto");
}

function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(json)?/i, "")
    .replace(/```$/, "")
    .trim();
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function containsUrl(text: string): boolean {
  return /(https?:\/\/|\bwww\.)/i.test(text);
}
