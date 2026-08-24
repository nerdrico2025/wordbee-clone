import { AI_MODELS } from "./models.js";
import { fetchJsonOrThrow, fetchWithTimeout, parseJsonArrayResponse, parseJsonObjectResponse } from "./http.js";
import { AiProviderError, classifyHttpError } from "./errors.js";
import { buildArticleSystemPrompt, buildTitleSuggestionPrompt } from "../prompts/common.js";
import { ARTICLE_TYPE_PROMPTS } from "../prompts/article-types/index.js";
import { slugify } from "../slugify.js";
import type {
  GenerateArticleInput,
  GenerateImageInput,
  GenerateTitlesInput,
  GeneratedArticle,
  GeneratedImage,
  ImageProvider,
  TextProvider,
} from "./types.js";

const PROVIDER = "openai";
const BASE_URL = "https://api.openai.com/v1";

async function chatCompletion(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const json = (await fetchJsonOrThrow(PROVIDER, `${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_MODELS.openai.text,
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

export function createOpenAiTextProvider(apiKey: string): TextProvider {
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

export function createOpenAiImageProvider(apiKey: string): ImageProvider {
  return {
    async generateImage({ prompt }: GenerateImageInput): Promise<GeneratedImage> {
      const json = (await fetchJsonOrThrow(PROVIDER, `${BASE_URL}/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: AI_MODELS.openai.image,
          prompt,
          n: 1,
          size: "1024x1024",
          response_format: "b64_json",
        }),
      })) as { data?: Array<{ b64_json?: string }> };

      const b64 = json.data?.[0]?.b64_json;
      if (!b64) throw new AiProviderError("unknown", PROVIDER, "resposta de imagem vazia");
      return { base64: b64, mimeType: "image/png" };
    },
  };
}

export async function validateOpenAiKey(apiKey: string): Promise<void> {
  const res = await fetchWithTimeout(PROVIDER, `${BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw classifyHttpError(res.status, PROVIDER, bodyText);
  }
}
