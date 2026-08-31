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

/**
 * Copy de um pacote de distribuição (post de captação para Página do
 * Facebook). `tipoLabel` é o rótulo do tipo de artigo (ex.: "Receita"),
 * reaproveitado de `ARTICLE_TYPE_PROMPTS`.
 */
export interface GenerateDistributionCopyInput {
  titulo: string;
  tema?: string;
  tipoLabel: string;
  tipoPacote: "CAPTACAO" | "DIRETO_SITE";
  /**
   * Quantas variações de copy gerar numa única chamada (padrão 1). Mais de
   * uma permite ao usuário escolher qual usar sem gastar outra chamada de
   * IA — e variar a palavra-chave pedida entre elas ajuda o engajamento.
   */
  quantidade?: number;
}

export interface GeneratedDistributionCopy {
  /** Legenda do post na Página. Nunca contém link (ver prompts/distribution.ts). */
  copyDescricao: string;
  /** Texto do primeiro comentário. O link é anexado pelo código, não pelo modelo. */
  copyComentario: string;
  /** Palavra-chave que o post pede para a pessoa comentar (ex.: "QUERO"). */
  palavraChave: string;
}

export interface TextProvider {
  generateTitles(input: GenerateTitlesInput): Promise<string[]>;
  generateArticle(input: GenerateArticleInput): Promise<GeneratedArticle>;
  /**
   * Gera a copy de distribuição de um artigo. Vive no `TextProvider` (e não
   * num módulo separado que chame um provedor fixo) para continuar valendo
   * a mesma regra do resto do projeto: qualquer provedor de texto com chave
   * configurada serve, sem `if` por nome de provedor espalhado no código.
   *
   * Devolve sempre um array (com `quantidade` itens, mínimo 1) — a primeira
   * variação é a padrão, as demais ficam guardadas no pacote para o usuário
   * trocar sem gastar outra chamada de IA.
   */
  generateDistributionCopy(input: GenerateDistributionCopyInput): Promise<GeneratedDistributionCopy[]>;
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
