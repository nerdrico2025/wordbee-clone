import { AI_MODELS } from "./models.js";
import { fetchJsonOrThrow, fetchStreamedTextOrThrow, fetchWithTimeout, parseJsonArrayResponse, parseJsonObjectResponse } from "./http.js";
import { AiProviderError, classifyHttpError } from "./errors.js";
import { buildArticleSystemPrompt, buildTitleSuggestionPrompt } from "../prompts/common.js";
import { buildDistributionCopySystemPrompt, buildDistributionCopyUserPrompt } from "../prompts/distribution.js";
import { ARTICLE_TYPE_PROMPTS } from "../prompts/article-types/index.js";
import { slugify } from "../slugify.js";
import { parseDistributionCopyResponse } from "./distribution-copy.js";
import type {
  GenerateArticleInput,
  GenerateDistributionCopyInput,
  GenerateImageInput,
  GenerateTitlesInput,
  GeneratedArticle,
  GeneratedDistributionCopy,
  GeneratedImage,
  ImageProvider,
  TextProvider,
} from "./types.js";

const PROVIDER = "openrouter";
const BASE_URL = "https://openrouter.ai/api/v1";

// OpenRouter recomenda esses dois headers opcionais para identificar a
// aplicação nas requisições (aparecem nos rankings de uso do painel do
// OpenRouter) — valores genéricos do projeto, não afetam autenticação nem
// a resposta da API.
const EXTRA_HEADERS = {
  "HTTP-Referer": "https://github.com/nerdrico2025/wordbee-clone",
  "X-Title": "Wordbee Clone",
};

type OpenRouterCallTipo = "titulo" | "artigo" | "imagem" | "copy_distribuicao";
type OpenRouterCallModo = "stream" | "sync";

/**
 * Log de latência por chamada, mesmo quando ela dá timeout/erro —
 * instrumentação adicionada em 2026-08-27 pra distinguir degradação
 * sustentada do provedor (quase toda chamada batendo o teto do timeout) de
 * algo mais específico (ex.: só chamadas concorrentes demoram). Campo
 * `modo` adicionado depois, na mudança de timeout fixo pra streaming com
 * idle timeout (mesmo dia) — permite comparar taxa de timeout antes/depois
 * olhando o mesmo log. Ver DECISIONS.md.
 */
function logOpenRouterCall(tipo: OpenRouterCallTipo, modo: OpenRouterCallModo, startedAt: number, err?: unknown): void {
  const duracaoMs = Date.now() - startedAt;
  const resultado = !err ? "ok" : err instanceof AiProviderError && err.code === "timeout" ? "timeout" : "erro";
  console.log(
    JSON.stringify({
      evento: "openrouter_call",
      tipo,
      modo,
      duracaoMs,
      resultado,
      ...(err ? { detalhe: err instanceof Error ? err.message : String(err) } : {}),
    })
  );
}

/**
 * `stream: true` + `fetchStreamedTextOrThrow`, não `fetchJsonOrThrow` com
 * teto fixo: um teto fixo (60s/90s, removido nesta mudança) matava chamadas
 * que estavam progredindo normalmente, só demorando mais que o teto pra
 * terminar um artigo longo — o padrão observado em produção era a maioria
 * das chamadas batendo exatamente o teto. O timeout de inatividade
 * (`fetchStreamedTextOrThrow`, `packages/shared/src/ai/http.ts`) só aborta
 * se ficar `idleTimeoutMs` sem receber nenhum chunk novo — uma chamada que
 * segue recebendo texto aos poucos nunca esbarra nele, não importa quanto
 * tempo total leve. Ver DECISIONS.md.
 */
async function chatCompletion(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  tipo: "titulo" | "artigo" | "copy_distribuicao"
): Promise<string> {
  const startedAt = Date.now();
  try {
    const content = await fetchStreamedTextOrThrow(PROVIDER, `${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...EXTRA_HEADERS },
      body: JSON.stringify({
        model: AI_MODELS.openrouter.text,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.8,
        stream: true,
      }),
    });

    if (!content) throw new AiProviderError("unknown", PROVIDER, "resposta vazia do modelo");

    logOpenRouterCall(tipo, "stream", startedAt);
    return content;
  } catch (err) {
    logOpenRouterCall(tipo, "stream", startedAt, err);
    throw err;
  }
}

export function createOpenRouterTextProvider(apiKey: string): TextProvider {
  return {
    async generateTitles({ tipo, tema, quantidade = 5, titulosExistentes }: GenerateTitlesInput) {
      const config = ARTICLE_TYPE_PROMPTS[tipo];
      const prompt = buildTitleSuggestionPrompt({ tipoLabel: config.label, tema, quantidade, titulosExistentes });
      const content = await chatCompletion(apiKey, "Você é um especialista em títulos otimizados para SEO.", prompt, "titulo");
      return parseJsonArrayResponse(content, PROVIDER);
    },

    async generateArticle({ tipo, tema, titulo, promptCustomizado }: GenerateArticleInput): Promise<GeneratedArticle> {
      const config = ARTICLE_TYPE_PROMPTS[tipo];
      const systemPrompt = buildArticleSystemPrompt({ tipoLabel: config.label, estrutura: config.estrutura, tema, titulo, promptCustomizado });
      const userPrompt = `Escreva o artigo agora. Responda APENAS com um JSON contendo as chaves:
- "contentHtml": string com o HTML completo do artigo
- "excerpt": resumo de até 160 caracteres, texto simples sem HTML
- "metaTitle": título otimizado para SEO, até 60 caracteres

Não use markdown nem texto fora do JSON.`;
      const content = await chatCompletion(apiKey, systemPrompt, userPrompt, "artigo");
      const parsed = parseJsonObjectResponse<{ contentHtml: string; excerpt: string; metaTitle: string }>(content, PROVIDER);
      return {
        contentHtml: parsed.contentHtml,
        excerpt: parsed.excerpt,
        metaTitle: parsed.metaTitle,
        slug: slugify(titulo),
      };
    },

    async generateDistributionCopy(input: GenerateDistributionCopyInput): Promise<GeneratedDistributionCopy[]> {
      const content = await chatCompletion(
        apiKey,
        buildDistributionCopySystemPrompt(input),
        buildDistributionCopyUserPrompt(input),
        "copy_distribuicao"
      );
      return parseDistributionCopyResponse(content, PROVIDER);
    },
  };
}

/** GET /models não consome créditos — chamada barata de validação (RF-15). */
export async function validateOpenRouterKey(apiKey: string): Promise<void> {
  const res = await fetchWithTimeout(PROVIDER, `${BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${apiKey}`, ...EXTRA_HEADERS },
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw classifyHttpError(res.status, PROVIDER, bodyText);
  }
}

interface OpenRouterImageResponse {
  data?: Array<{ b64_json?: string; media_type?: string }>;
}

/**
 * Verdadeiro quando o erro é o 400 que o OpenRouter retorna ao passar
 * "input_references" para um modelo cujo endpoint não declara suporte a
 * esse parâmetro (ver `supported_parameters` na Image Models API). Não há
 * um `AiErrorCode` dedicado para isso — é tratado como fallback silencioso
 * (gerar de novo sem referência), não como erro para o usuário.
 */
function isUnsupportedReferencesError(err: unknown): boolean {
  return err instanceof AiProviderError && err.code === "unknown" && /input_references/i.test(err.message);
}

async function requestImage(apiKey: string, body: Record<string, unknown>): Promise<GeneratedImage> {
  const startedAt = Date.now();
  try {
    const json = (await fetchJsonOrThrow(PROVIDER, `${BASE_URL}/images`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...EXTRA_HEADERS },
      body: JSON.stringify(body),
    })) as OpenRouterImageResponse;

    const item = json.data?.[0];
    if (!item?.b64_json) throw new AiProviderError("unknown", PROVIDER, "resposta de imagem vazia");

    logOpenRouterCall("imagem", "sync", startedAt);
    return { base64: item.b64_json, mimeType: item.media_type ?? "image/png" };
  } catch (err) {
    logOpenRouterCall("imagem", "sync", startedAt, err);
    throw err;
  }
}

/**
 * OpenRouter tem uma Image API dedicada (`POST /images`, formato diferente
 * de `/chat/completions`), que reaproveita a mesma chave/autenticação do
 * provider de texto. Modelo padrão configurável via
 * `OPENROUTER_IMAGE_DEFAULT_MODEL` — "Nano Banana" (Gemini 2.5 Flash Image),
 * o mesmo modelo comercial usado no provider Gemini direto.
 */
export function createOpenRouterImageProvider(apiKey: string): ImageProvider {
  return {
    async generateImage({ prompt, referenceImages }: GenerateImageInput): Promise<GeneratedImage> {
      const baseBody = { model: AI_MODELS.openrouter.image, prompt, n: 1 };

      if (!referenceImages || referenceImages.length === 0) {
        return requestImage(apiKey, baseBody);
      }

      const input_references = referenceImages.map((ref) => ({
        type: "image_url",
        image_url: { url: `data:${ref.mimeType};base64,${ref.base64}` },
      }));

      try {
        return await requestImage(apiKey, { ...baseBody, input_references });
      } catch (err) {
        if (!isUnsupportedReferencesError(err)) throw err;
        // Fallback: o modelo configurado não suporta imagens de referência
        // (não é um erro do usuário) — gera sem elas em vez de falhar o
        // artigo inteiro, e avisa nos logs para investigação.
        // eslint-disable-next-line no-console
        console.warn(`[ai:${PROVIDER}] modelo "${AI_MODELS.openrouter.image}" não suporta input_references; gerando sem imagens de referência.`);
        return requestImage(apiKey, baseBody);
      }
    },
  };
}
