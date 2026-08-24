import type { AiProviderName } from "./types.js";

export interface TextProviderInfo {
  provider: AiProviderName;
  nome: string;
  modeloLabel: string;
  descricao: string;
  keyPrefixPlaceholder: string;
  gratuito?: boolean;
  gratuitoNota?: string;
  docsUrl: string;
}

export interface ImageProviderInfo extends TextProviderInfo {
  suportaImagensReferencia?: boolean;
}

export const TEXT_PROVIDERS: TextProviderInfo[] = [
  {
    provider: "OPENAI",
    nome: "OpenAI",
    modeloLabel: "GPT-4o",
    descricao: "Modelo da OpenAI com ótimo custo-benefício para redação de artigos.",
    keyPrefixPlaceholder: "sk-...",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    provider: "GEMINI",
    nome: "Gemini",
    modeloLabel: "Gemini 2.5 Flash",
    descricao: "Rápido, com uma cota diária gratuita generosa do Google.",
    keyPrefixPlaceholder: "AIza...",
    gratuito: true,
    gratuitoNota: "Gratuito até 1500 req/dia (texto) e 500/dia (imagem)",
    docsUrl: "https://aistudio.google.com/apikey",
  },
  {
    provider: "GROK",
    nome: "Grok (xAI)",
    modeloLabel: "Grok 2",
    descricao: "Modelo da xAI, com boa velocidade de resposta.",
    keyPrefixPlaceholder: "xai-...",
    docsUrl: "https://console.x.ai",
  },
];

export const IMAGE_PROVIDERS: ImageProviderInfo[] = [
  {
    provider: "OPENAI",
    nome: "OpenAI",
    modeloLabel: "DALL-E 3",
    descricao: "Imagens de alta qualidade geradas pela OpenAI.",
    keyPrefixPlaceholder: "sk-...",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    provider: "GEMINI",
    nome: "Gemini",
    modeloLabel: "Nano Banana (Gemini 2.5 Flash Image)",
    descricao: "Suporta imagens de referência para guiar a direção de arte.",
    keyPrefixPlaceholder: "AIza...",
    gratuito: true,
    gratuitoNota: "Gratuito até 1500 req/dia (texto) e 500/dia (imagem)",
    docsUrl: "https://aistudio.google.com/apikey",
    suportaImagensReferencia: true,
  },
  {
    provider: "GROK",
    nome: "Grok",
    modeloLabel: "Grok Imagine",
    descricao: "Geração de imagem da xAI.",
    keyPrefixPlaceholder: "xai-...",
    docsUrl: "https://console.x.ai",
  },
  {
    provider: "STABILITY",
    nome: "Stability AI",
    modeloLabel: "Stable Diffusion 3.5",
    descricao: "Créditos grátis para novos usuários.",
    keyPrefixPlaceholder: "sk-...",
    gratuito: true,
    gratuitoNota: "Créditos grátis para novos usuários!",
    docsUrl: "https://platform.stability.ai/account/keys",
  },
];
