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
} as const;
