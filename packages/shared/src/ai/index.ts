import { createOpenAiTextProvider, createOpenAiImageProvider, validateOpenAiKey } from "./openai.js";
import { createGeminiTextProvider, createGeminiImageProvider, validateGeminiKey } from "./gemini.js";
import { createGrokTextProvider, createGrokImageProvider, validateGrokKey } from "./grok.js";
import { createStabilityImageProvider, validateStabilityKey } from "./stability.js";
import { createOpenRouterTextProvider, createOpenRouterImageProvider, validateOpenRouterKey } from "./openrouter.js";
import type { AiProviderName, ImageProvider, TextProvider } from "./types.js";

/**
 * `modelId` é o modelo já resolvido por `resolveModelId` (painel → env →
 * padrão). Omitido, cada provedor resolve env → padrão sozinho — mesmo
 * comportamento de antes do modelo configurável pelo painel.
 */
export function createTextProvider(provider: AiProviderName, apiKey: string, modelId?: string): TextProvider {
  switch (provider) {
    case "OPENAI":
      return createOpenAiTextProvider(apiKey, modelId);
    case "GEMINI":
      return createGeminiTextProvider(apiKey, modelId);
    case "GROK":
      return createGrokTextProvider(apiKey, modelId);
    case "OPENROUTER":
      return createOpenRouterTextProvider(apiKey, modelId);
    case "STABILITY":
      throw new Error("Stability AI não oferece geração de texto.");
  }
}

export function createImageProvider(provider: AiProviderName, apiKey: string, modelId?: string): ImageProvider {
  switch (provider) {
    case "OPENAI":
      return createOpenAiImageProvider(apiKey, modelId);
    case "GEMINI":
      return createGeminiImageProvider(apiKey, modelId);
    case "GROK":
      return createGrokImageProvider(apiKey, modelId);
    case "STABILITY":
      return createStabilityImageProvider(apiKey, modelId);
    case "OPENROUTER":
      return createOpenRouterImageProvider(apiKey, modelId);
  }
}

export async function validateProviderKey(provider: AiProviderName, apiKey: string): Promise<void> {
  switch (provider) {
    case "OPENAI":
      return validateOpenAiKey(apiKey);
    case "GEMINI":
      return validateGeminiKey(apiKey);
    case "GROK":
      return validateGrokKey(apiKey);
    case "STABILITY":
      return validateStabilityKey(apiKey);
    case "OPENROUTER":
      return validateOpenRouterKey(apiKey);
  }
}

export * from "./types.js";
export * from "./errors.js";
export * from "./models.js";
export * from "./registry.js";
export * from "./openrouter-catalog.js";
