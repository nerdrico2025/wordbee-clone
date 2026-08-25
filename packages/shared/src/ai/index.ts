import { createOpenAiTextProvider, createOpenAiImageProvider, validateOpenAiKey } from "./openai.js";
import { createGeminiTextProvider, createGeminiImageProvider, validateGeminiKey } from "./gemini.js";
import { createGrokTextProvider, createGrokImageProvider, validateGrokKey } from "./grok.js";
import { createStabilityImageProvider, validateStabilityKey } from "./stability.js";
import { createOpenRouterTextProvider, createOpenRouterImageProvider, validateOpenRouterKey } from "./openrouter.js";
import type { AiProviderName, ImageProvider, TextProvider } from "./types.js";

export function createTextProvider(provider: AiProviderName, apiKey: string): TextProvider {
  switch (provider) {
    case "OPENAI":
      return createOpenAiTextProvider(apiKey);
    case "GEMINI":
      return createGeminiTextProvider(apiKey);
    case "GROK":
      return createGrokTextProvider(apiKey);
    case "OPENROUTER":
      return createOpenRouterTextProvider(apiKey);
    case "STABILITY":
      throw new Error("Stability AI não oferece geração de texto.");
  }
}

export function createImageProvider(provider: AiProviderName, apiKey: string): ImageProvider {
  switch (provider) {
    case "OPENAI":
      return createOpenAiImageProvider(apiKey);
    case "GEMINI":
      return createGeminiImageProvider(apiKey);
    case "GROK":
      return createGrokImageProvider(apiKey);
    case "STABILITY":
      return createStabilityImageProvider(apiKey);
    case "OPENROUTER":
      return createOpenRouterImageProvider(apiKey);
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
