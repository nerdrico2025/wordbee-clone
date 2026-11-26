import { fetchJsonOrThrow, fetchWithTimeout } from "./http.js";
import { AiProviderError, classifyHttpError } from "./errors.js";
import type { ModelKind } from "./models.js";

const PROVIDER = "openrouter";
const BASE_URL = "https://openrouter.ai/api/v1";
const EXTRA_HEADERS = {
  "HTTP-Referer": "https://github.com/nerdrico2025/wordbee-clone",
  "X-Title": "Wordbee Clone",
};
const CATALOG_TIMEOUT_MS = 15_000;

/** Modelo do catálogo do OpenRouter, normalizado para a tela de Modelos de IA. */
export interface OpenRouterModelInfo {
  id: string;
  nome: string;
  contexto: number | null;
  /** USD por token de entrada (o OpenRouter devolve string; aqui já é número). */
  precoEntradaPorToken: number | null;
  /** USD por token de saída. */
  precoSaidaPorToken: number | null;
  /** USD por imagem de entrada, quando o modelo cobra por imagem. */
  precoPorImagem: number | null;
}

interface RawModel {
  id?: string;
  name?: string;
  context_length?: number | null;
  pricing?: { prompt?: string; completion?: string; image?: string };
}

function headers(apiKey?: string): Record<string, string> {
  return { ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}), ...EXTRA_HEADERS };
}

function price(value: string | undefined): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  // "-1" é usado pelo OpenRouter para preço variável/desconhecido.
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function normalize(raw: RawModel, nomeOverride?: string): OpenRouterModelInfo {
  const pricing = raw.pricing ?? {};
  const imagem = price(pricing.image);
  return {
    id: raw.id!,
    nome: nomeOverride ?? raw.name ?? raw.id!,
    contexto: typeof raw.context_length === "number" ? raw.context_length : null,
    precoEntradaPorToken: price(pricing.prompt),
    precoSaidaPorToken: price(pricing.completion),
    precoPorImagem: imagem && imagem > 0 ? imagem : null,
  };
}

async function listModels(url: string, apiKey?: string): Promise<RawModel[]> {
  const json = (await fetchJsonOrThrow(PROVIDER, url, { headers: headers(apiKey) }, CATALOG_TIMEOUT_MS)) as { data?: RawModel[] };
  return (json.data ?? []).filter((m): m is RawModel & { id: string } => typeof m.id === "string" && m.id.length > 0);
}

/**
 * Catálogo de modelos do OpenRouter por tipo de saída.
 *
 * - Texto: `GET /models?output_modalities=text` (o padrão do endpoint já é
 *   "text", mas fica explícito).
 * - Imagem: a geração usa a Image API dedicada (`POST /images`), cujos
 *   modelos compatíveis são listados em `GET /images/models` — que não traz
 *   preço. O preço vem de `GET /models?output_modalities=image`, cruzado por
 *   id. Se `/images/models` falhar, usa só a segunda lista.
 *
 * Confirmado na doc da API em 2026-11-25. Lança em caso de falha — quem
 * chama decide o fallback (a rota devolve lista vazia).
 */
export async function fetchOpenRouterCatalog(kind: ModelKind, apiKey?: string): Promise<OpenRouterModelInfo[]> {
  if (kind === "text") {
    const models = await listModels(`${BASE_URL}/models?output_modalities=text`, apiKey);
    return models.map((m) => normalize(m));
  }

  const [imageApi, priced] = await Promise.allSettled([
    listModels(`${BASE_URL}/images/models`, apiKey),
    listModels(`${BASE_URL}/models?output_modalities=image`, apiKey),
  ]);
  const pricedById = new Map((priced.status === "fulfilled" ? priced.value : []).map((m) => [m.id!, m]));

  if (imageApi.status === "fulfilled") {
    return imageApi.value.map((m) => normalize({ ...m, ...pricedById.get(m.id!), id: m.id }, m.name));
  }
  if (priced.status === "fulfilled") return priced.value.map((m) => normalize(m));
  throw imageApi.reason;
}

export interface ModelTestResult {
  ok: boolean;
  mensagem: string;
}

function notFound(modelId: string): ModelTestResult {
  return { ok: false, mensagem: `Modelo "${modelId}" não encontrado no OpenRouter. Confira o ID no catálogo.` };
}

const MODEL_NOT_FOUND_RE = /not a valid model|model.{0,40}(not found|does not exist|unknown)|no endpoints found|invalid model/i;

/**
 * Teste rápido do modelo escolhido, antes de salvar.
 *
 * - Texto: 1 chamada mínima a `/chat/completions` (sem stream, max_tokens
 *   baixo) — custo de uma frase curta.
 * - Imagem: NÃO gera imagem (custaria uma geração inteira) — só confere que
 *   o ID existe na lista da Image API.
 */
export async function testOpenRouterModel(kind: ModelKind, apiKey: string, modelId: string): Promise<ModelTestResult> {
  try {
    if (kind === "image") {
      const catalogo = await fetchOpenRouterCatalog("image", apiKey);
      return catalogo.some((m) => m.id === modelId)
        ? { ok: true, mensagem: `Modelo "${modelId}" disponível para gerar imagens.` }
        : notFound(modelId);
    }

    const res = await fetchWithTimeout(
      PROVIDER,
      `${BASE_URL}/chat/completions`,
      {
        method: "POST",
        headers: { ...headers(apiKey), "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: "Responda apenas com a palavra: ok" }],
          max_tokens: 8,
          stream: false,
        }),
      },
      30_000
    );
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      if ((res.status === 400 || res.status === 404) && MODEL_NOT_FOUND_RE.test(bodyText)) return notFound(modelId);
      throw classifyHttpError(res.status, PROVIDER, bodyText);
    }
    return { ok: true, mensagem: `Modelo "${modelId}" respondeu normalmente.` };
  } catch (err) {
    if (err instanceof AiProviderError) return { ok: false, mensagem: err.userMessage };
    return { ok: false, mensagem: "Não foi possível testar o modelo agora. Tente de novo em instantes." };
  }
}
