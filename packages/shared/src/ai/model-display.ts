import type { AiProviderName } from "./types.js";
import { resolveModel, type AiModelSettings, type ModelKind, type ModelOrigem } from "./models.js";
import { IMAGE_PROVIDERS, TEXT_PROVIDERS } from "./registry.js";

/**
 * Nome amigável dos modelos padrão do código (CODE_DEFAULT_MODELS), por ID.
 * É a única fonte de "nome bonito" fora do catálogo do OpenRouter — a tela
 * NUNCA mostra um rótulo de modelo fixo por provedor: o rótulo sempre parte
 * do modelId resolvido (painel → env → padrão), o mesmo que a geração usa.
 * Ver DECISIONS.md "rótulo de modelo dinâmico" (2026-11-26).
 */
export const KNOWN_MODEL_NAMES: Readonly<Record<string, string>> = {
  "gpt-4o": "GPT-4o",
  "dall-e-3": "DALL-E 3",
  "gemini-3.6-flash": "Gemini 3.6 Flash",
  "gemini-2.5-flash-image": "Nano Banana (Gemini 2.5 Flash Image)",
  "grok-2-latest": "Grok 2",
  "grok-2-image": "Grok Imagine",
  "sd3.5-large": "Stable Diffusion 3.5",
  "deepseek/deepseek-v4-flash-0731": "DeepSeek V4 Flash",
  "google/gemini-2.5-flash-image": "Nano Banana (Gemini 2.5 Flash Image)",
};

/** Nome amigável: nomes extras (ex.: salvos do catálogo) → conhecidos → o próprio ID. */
export function friendlyModelName(modelId: string, extraNames?: Readonly<Record<string, string | null | undefined>> | null): string {
  return extraNames?.[modelId]?.trim() || KNOWN_MODEL_NAMES[modelId] || modelId;
}

/** Modelo gravado num artigo (`modelo_texto`/`modelo_imagem`); artigos antigos sem o campo → "—". */
export function formatArticleModel(
  modelId: string | null | undefined,
  extraNames?: Readonly<Record<string, string | null | undefined>> | null
): string {
  const id = modelId?.trim();
  return id ? friendlyModelName(id, extraNames) : "—";
}

export interface ModelDisplay {
  modelId: string;
  /** Nome amigável do modelo (ou o ID, se não houver nome). */
  nome: string;
  /** "<Provedor> (<nome do modelo>)", ex.: "OpenRouter (DeepSeek V4 Flash)". */
  label: string;
  origem: ModelOrigem;
}

function providerName(kind: ModelKind, provider: AiProviderName): string {
  const registry = kind === "text" ? TEXT_PROVIDERS : IMAGE_PROVIDERS;
  return registry.find((p) => p.provider === provider)?.nome ?? provider;
}

/**
 * O que a tela mostra para um provedor: usa `resolveModel` (o mesmo de
 * `resolveModelId`, chamado pela geração), então a tela nunca diverge do que
 * roda. O nome salvo no painel só vale quando o modelo veio do painel.
 */
export function resolveModelDisplay(
  kind: ModelKind,
  provider: AiProviderName,
  settings?: AiModelSettings | null,
  env?: Record<string, string | undefined>
): ModelDisplay {
  const { modelId, origem } = resolveModel(kind, provider, settings, env);
  const nomePainel = origem === "painel" ? (kind === "text" ? settings?.textModelName : settings?.imageModelName) : null;
  const nome = friendlyModelName(modelId, nomePainel ? { [modelId]: nomePainel } : null);
  return { modelId, nome, label: `${providerName(kind, provider)} (${nome})`, origem };
}
