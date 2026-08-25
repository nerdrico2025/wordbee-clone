import type { ArticleTypeSlug } from "../article-types.js";

/** Casing igual ao enum AiProvider do Prisma (packages/db), para evitar camada de tradução. */
export type AiProviderName = "OPENAI" | "GEMINI" | "GROK" | "STABILITY" | "OPENROUTER";

export interface GenerateTitlesInput {
  tipo: ArticleTypeSlug;
  tema: string;
  quantidade?: number;
  titulosExistentes?: string[];
}

export interface GenerateArticleInput {
  tipo: ArticleTypeSlug;
  tema: string;
  titulo: string;
  promptCustomizado?: string;
}

export interface GeneratedArticle {
  contentHtml: string;
  excerpt: string;
  slug: string;
  metaTitle: string;
}

export interface TextProvider {
  generateTitles(input: GenerateTitlesInput): Promise<string[]>;
  generateArticle(input: GenerateArticleInput): Promise<GeneratedArticle>;
}

export interface ReferenceImageInput {
  base64: string;
  mimeType: string;
}

export interface GenerateImageInput {
  prompt: string;
  referenceImages?: ReferenceImageInput[];
}

export interface GeneratedImage {
  base64: string;
  mimeType: string;
}

export interface ImageProvider {
  generateImage(input: GenerateImageInput): Promise<GeneratedImage>;
}

/** Chamada barata para validar se uma chave de API é válida. Lança AiProviderError se não for. */
export type ValidateKeyFn = (apiKey: string) => Promise<void>;
