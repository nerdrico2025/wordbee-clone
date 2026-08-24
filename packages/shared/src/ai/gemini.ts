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

const PROVIDER = "gemini";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

async function generateContent(apiKey: string, model: string, systemPrompt: string | undefined, parts: GeminiPart[], responseModalities?: string[]): Promise<GeminiResponse> {
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts }],
  };
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }
  if (responseModalities) {
    body.generationConfig = { responseModalities };
  }

  return (await fetchJsonOrThrow(PROVIDER, `${BASE_URL}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })) as GeminiResponse;
}

function textFromResponse(json: GeminiResponse): string {
  if (json.promptFeedback?.blockReason) {
    throw new AiProviderError("content_blocked", PROVIDER, json.promptFeedback.blockReason);
  }
  const text = json.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
  if (!text) throw new AiProviderError("unknown", PROVIDER, "resposta de texto vazia");
  return text;
}

export function createGeminiTextProvider(apiKey: string): TextProvider {
  return {
    async generateTitles({ tipo, tema, quantidade = 5, titulosExistentes }: GenerateTitlesInput) {
      const config = ARTICLE_TYPE_PROMPTS[tipo];
      const prompt = buildTitleSuggestionPrompt({ tipoLabel: config.label, tema, quantidade, titulosExistentes });
      const json = await generateContent(apiKey, AI_MODELS.gemini.text, undefined, [{ text: prompt }]);
      return parseJsonArrayResponse(textFromResponse(json), PROVIDER);
    },

    async generateArticle({ tipo, tema, titulo, promptCustomizado }: GenerateArticleInput): Promise<GeneratedArticle> {
      const config = ARTICLE_TYPE_PROMPTS[tipo];
      const systemPrompt = buildArticleSystemPrompt({ tipoLabel: config.label, estrutura: config.estrutura, tema, titulo, promptCustomizado });
      const userPrompt = `Escreva o artigo agora. Responda APENAS com um JSON contendo as chaves:
- "contentHtml": string com o HTML completo do artigo
- "excerpt": resumo de até 160 caracteres, texto simples sem HTML
- "metaTitle": título otimizado para SEO, até 60 caracteres

Não use markdown nem texto fora do JSON.`;
      const json = await generateContent(apiKey, AI_MODELS.gemini.text, systemPrompt, [{ text: userPrompt }]);
      const parsed = parseJsonObjectResponse<{ contentHtml: string; excerpt: string; metaTitle: string }>(textFromResponse(json), PROVIDER);
      return {
        contentHtml: parsed.contentHtml,
        excerpt: parsed.excerpt,
        metaTitle: parsed.metaTitle,
        slug: slugify(titulo),
      };
    },
  };
}

export function createGeminiImageProvider(apiKey: string): ImageProvider {
  return {
    async generateImage({ prompt, referenceImages }: GenerateImageInput): Promise<GeneratedImage> {
      const parts: GeminiPart[] = [{ text: prompt }];
      for (const ref of referenceImages ?? []) {
        parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.base64 } });
      }

      const json = await generateContent(apiKey, AI_MODELS.gemini.image, undefined, parts, ["TEXT", "IMAGE"]);
      if (json.promptFeedback?.blockReason) {
        throw new AiProviderError("content_blocked", PROVIDER, json.promptFeedback.blockReason);
      }
      const imagePart = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
      if (!imagePart?.inlineData) throw new AiProviderError("unknown", PROVIDER, "resposta sem imagem");
      return { base64: imagePart.inlineData.data, mimeType: imagePart.inlineData.mimeType };
    },
  };
}

export async function validateGeminiKey(apiKey: string): Promise<void> {
  const res = await fetchWithTimeout(PROVIDER, `${BASE_URL}/models?pageSize=1`, {
    headers: { "x-goog-api-key": apiKey },
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw classifyHttpError(res.status, PROVIDER, bodyText);
  }
}
