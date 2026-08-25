/**
 * Nomes de modelo por provedor, configuráveis por env (RF-10/RF-11 do PRD).
 * Ver DECISIONS.md para notas sobre nomes de modelo que divergem do rótulo
 * comercial usado na UI (ex.: "Grok Imagine" na tela, "grok-2-image" na API).
 */
export const AI_MODELS = {
  openai: {
    text: process.env.OPENAI_TEXT_MODEL || "gpt-4o",
    image: process.env.OPENAI_IMAGE_MODEL || "dall-e-3",
  },
  gemini: {
    text: process.env.GEMINI_TEXT_MODEL || "gemini-3.6-flash",
    image: process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image",
  },
  grok: {
    text: process.env.GROK_TEXT_MODEL || "grok-2-latest",
    image: process.env.GROK_IMAGE_MODEL || "grok-2-image",
  },
  stability: {
    image: process.env.STABILITY_IMAGE_MODEL || "sd3.5-large",
  },
  // O padrão de texto é o slug atual do DeepSeek V4 Flash no catálogo do
  // OpenRouter, confirmado em
  // https://openrouter.ai/deepseek/deepseek-v4-flash-0731 (build de
  // 2026-07-31; "deepseek/deepseek-v4-flash" sem sufixo é o preview antigo
  // de abril/2026 e não deve ser usado). O padrão de imagem é o mesmo
  // "Nano Banana" (Gemini 2.5 Flash Image) usado no provedor Gemini direto,
  // confirmado via GET /api/v1/models?output_modalities=image em 2026-08-25.
  openrouter: {
    text: process.env.OPENROUTER_DEFAULT_MODEL || "deepseek/deepseek-v4-flash-0731",
    image: process.env.OPENROUTER_IMAGE_DEFAULT_MODEL || "google/gemini-2.5-flash-image",
  },
} as const;
