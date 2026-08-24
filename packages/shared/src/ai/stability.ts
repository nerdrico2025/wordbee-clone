import { AI_MODELS } from "./models.js";
import { fetchWithTimeout } from "./http.js";
import { AiProviderError, classifyHttpError } from "./errors.js";
import type { GenerateImageInput, GeneratedImage, ImageProvider } from "./types.js";

const PROVIDER = "stability";
const BASE_URL = "https://api.stability.ai";

export function createStabilityImageProvider(apiKey: string): ImageProvider {
  return {
    async generateImage({ prompt }: GenerateImageInput): Promise<GeneratedImage> {
      const form = new FormData();
      form.append("prompt", prompt);
      form.append("model", AI_MODELS.stability.image);
      form.append("output_format", "png");

      const res = await fetchWithTimeout(PROVIDER, `${BASE_URL}/v2beta/stable-image/generate/sd3`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        body: form,
      });

      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        throw classifyHttpError(res.status, PROVIDER, bodyText);
      }

      const json = (await res.json()) as { image?: string; finish_reason?: string };
      if (json.finish_reason === "CONTENT_FILTERED") {
        throw new AiProviderError("content_blocked", PROVIDER, "CONTENT_FILTERED");
      }
      if (!json.image) throw new AiProviderError("unknown", PROVIDER, "resposta de imagem vazia");
      return { base64: json.image, mimeType: "image/png" };
    },
  };
}

export async function validateStabilityKey(apiKey: string): Promise<void> {
  const res = await fetchWithTimeout(PROVIDER, `${BASE_URL}/v1/user/account`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw classifyHttpError(res.status, PROVIDER, bodyText);
  }
}
