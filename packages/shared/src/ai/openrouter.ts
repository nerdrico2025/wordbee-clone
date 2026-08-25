import { AI_MODELS } from "./models.js";
import { fetchJsonOrThrow, fetchWithTimeout, parseJsonArrayResponse, parseJsonObjectResponse } from "./http.js";
import { AiProviderError, classifyHttpError } from "./errors.js";
import { buildArticleSystemPrompt, buildTitleSuggestionPrompt } from "../prompts/common.js";
import { ARTICLE_TYPE_PROMPTS } from "../prompts/article-types/index.js";
import { slugify } from "../slugify.js";
import type { GenerateArticleInput, GenerateTitlesInput, GeneratedArticle, TextProvider } from "./types.js";

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

async function chatCompletion(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const json = (await fetchJsonOrThrow(PROVIDER, `${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...EXTRA_HEADERS },
    body: JSON.stringify({
      model: AI_MODELS.openrouter.text,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.8,
    }),
  })) as { choices?: Array<{ message?: { content?: string } }> };

  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new AiProviderError("unknown", PROVIDER, "resposta vazia do modelo");
  return content;
}

/**
 * OpenRouter só oferece texto nesta versão (é um agregador de modelos de
 * texto/chat — o catálogo de imagem dele não segue o mesmo formato
 * request/response e fica fora do escopo por ora, ver DECISIONS.md).
 */
export function createOpenRouterTextProvider(apiKey: string): TextProvider {
  return {
    async generateTitles({ tipo, tema, quantidade = 5, titulosExistentes }: GenerateTitlesInput) {
      const config = ARTICLE_TYPE_PROMPTS[tipo];
      const prompt = buildTitleSuggestionPrompt({ tipoLabel: config.label, tema, quantidade, titulosExistentes });
      const content = await chatCompletion(apiKey, "Você é um especialista em títulos otimizados para SEO.", prompt);
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
      const content = await chatCompletion(apiKey, systemPrompt, userPrompt);
      const parsed = parseJsonObjectResponse<{ contentHtml: string; excerpt: string; metaTitle: string }>(content, PROVIDER);
      return {
        contentHtml: parsed.contentHtml,
        excerpt: parsed.excerpt,
        metaTitle: parsed.metaTitle,
        slug: slugify(titulo),
      };
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
