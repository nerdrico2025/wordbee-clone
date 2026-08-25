export interface SiteOption {
  id: string;
  nome: string;
}

export interface CategoryOption {
  id: number;
  name: string;
}

export type ProviderValue = "OPENAI" | "GEMINI" | "GROK" | "STABILITY" | "OPENROUTER";

export interface ProviderOption {
  provider: ProviderValue;
  nome: string;
  modeloLabel: string;
  suportaImagensReferencia?: boolean;
}
