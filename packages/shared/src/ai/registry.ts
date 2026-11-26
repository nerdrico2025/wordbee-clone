import type { AiProviderName } from "./types.js";

// Sem rótulo de modelo aqui de propósito: o modelo exibido vem sempre da
// configuração resolvida (`resolveModelDisplay` em model-display.ts).

export interface TextProviderInfo {
  provider: AiProviderName;
  nome: string;
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
    descricao: "Modelo da OpenAI com ótimo custo-benefício para redação de artigos.",
    keyPrefixPlaceholder: "sk-...",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    provider: "GEMINI",
    nome: "Gemini",
    descricao: "Rápido, com uma cota diária gratuita generosa do Google.",
    keyPrefixPlaceholder: "AIza...",
    gratuito: true,
    gratuitoNota: "Gratuito até 1500 req/dia (texto) e 500/dia (imagem)",
    docsUrl: "https://aistudio.google.com/apikey",
  },
  {
    provider: "GROK",
    nome: "Grok (xAI)",
    descricao: "Modelo da xAI, com boa velocidade de resposta.",
    keyPrefixPlaceholder: "xai-...",
    docsUrl: "https://console.x.ai",
  },
  {
    provider: "OPENROUTER",
    nome: "OpenRouter",
    descricao: "Vários modelos (DeepSeek, Claude, GPT…) com uma só chave. O modelo é escolhido em Modelos de IA.",
    keyPrefixPlaceholder: "sk-or-...",
    docsUrl: "https://openrouter.ai/keys",
  },
];

export const IMAGE_PROVIDERS: ImageProviderInfo[] = [
  {
    provider: "OPENAI",
    nome: "OpenAI",
    descricao: "Imagens de alta qualidade geradas pela OpenAI.",
    keyPrefixPlaceholder: "sk-...",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    provider: "GEMINI",
    nome: "Gemini",
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
    descricao: "Geração de imagem da xAI.",
    keyPrefixPlaceholder: "xai-...",
    docsUrl: "https://console.x.ai",
  },
  {
    provider: "STABILITY",
    nome: "Stability AI",
    descricao: "Créditos grátis para novos usuários.",
    keyPrefixPlaceholder: "sk-...",
    gratuito: true,
    gratuitoNota: "Créditos grátis para novos usuários!",
    docsUrl: "https://platform.stability.ai/account/keys",
  },
  {
    provider: "OPENROUTER",
    nome: "OpenRouter",
    descricao: "Modelos de imagem via OpenRouter, escolhidos em Modelos de IA. Mesma chave já cadastrada na aba de texto.",
    keyPrefixPlaceholder: "sk-or-...",
    docsUrl: "https://openrouter.ai/keys",
    suportaImagensReferencia: true,
  },
];
