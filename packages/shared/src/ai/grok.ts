import { AI_MODELS } from "./models.js";
import { fetchJsonOrThrow, fetchWithTimeout, parseJsonArrayResponse, parseJsonObjectResponse } from "./http.js";
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

const PROVIDER = "grok";
const BASE_URL = "https://api.x.ai/v1";

async function chatCompletion(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const json = (await fetchJsonOrThrow(PROVIDER, `${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_MODELS.grok.text,
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

export function createGrokTextProvider(apiKey: string): TextProvider {
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

    async generateDistributionCopy(input: GenerateDistributionCopyInput): Promise<GeneratedDistributionCopy[]> {
      const content = await chatCompletion(apiKey, buildDistributionCopySystemPrompt(input), buildDistributionCopyUserPrompt(input));
      return parseDistributionCopyResponse(content, PROVIDER);
    },
  };
}

export function createGrokImageProvider(apiKey: string): ImageProvider {
  return {
    async generateImage({ prompt }: GenerateImageInput): Promise<GeneratedImage> {
      const json = (await fetchJsonOrThrow(PROVIDER, `${BASE_URL}/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: AI_MODELS.grok.image, prompt, n: 1 }),
      })) as { data?: Array<{ b64_json?: string; url?: string }> };

      const item = json.data?.[0];
      if (!item) throw new AiProviderError("unknown", PROVIDER, "resposta de imagem vazia");

      if (item.b64_json) {
        return { base64: item.b64_json, mimeType: "image/jpeg" };
      }
      if (item.url) {
        const imgRes = await fetchWithTimeout(PROVIDER, item.url, {});
        if (!imgRes.ok) throw new AiProviderError("unknown", PROVIDER, "falha ao baixar imagem gerada");
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        return { base64: buffer.toString("base64"), mimeType: imgRes.headers.get("content-type") ?? "image/jpeg" };
      }
      throw new AiProviderError("unknown", PROVIDER, "resposta de imagem sem b64_json nem url");
    },
  };
}

export async function validateGrokKey(apiKey: string): Promise<void> {
  const res = await fetchWithTimeout(PROVIDER, `${BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw classifyHttpError(res.status, PROVIDER, bodyText);
  }
}
