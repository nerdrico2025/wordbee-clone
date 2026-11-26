import type { AiProviderName } from "./types.js";

/**
 * Nomes de modelo por provedor (RF-10/RF-11 do PRD). Ver DECISIONS.md para
 * notas sobre nomes de modelo que divergem do rótulo comercial usado na UI
 * (ex.: "Grok Imagine" na tela, "grok-2-image" na API).
 *
 * Desde 2026-11-25 o modelo é resolvido em três níveis (`resolveModelId`):
 * configuração do painel (tabela `ai_model_settings`) → env → padrão do
 * código abaixo. Ver DECISIONS.md "modelo de IA configurável pelo painel".
 */
export const CODE_DEFAULT_MODELS = {
  OPENAI: { text: "gpt-4o", image: "dall-e-3" },
  GEMINI: { text: "gemini-3.6-flash", image: "gemini-2.5-flash-image" },
  GROK: { text: "grok-2-latest", image: "grok-2-image" },
  STABILITY: { text: null, image: "sd3.5-large" },
  // O padrão de texto é o slug atual do DeepSeek V4 Flash no catálogo do
  // OpenRouter, confirmado em
  // https://openrouter.ai/deepseek/deepseek-v4-flash-0731 (build de
  // 2026-07-31; "deepseek/deepseek-v4-flash" sem sufixo é o preview antigo
  // de abril/2026 e não deve ser usado). O padrão de imagem é o mesmo
  // "Nano Banana" (Gemini 2.5 Flash Image) usado no provedor Gemini direto,
  // confirmado via GET /api/v1/models?output_modalities=image em 2026-08-25.
  OPENROUTER: { text: "deepseek/deepseek-v4-flash-0731", image: "google/gemini-2.5-flash-image" },
} as const satisfies Record<AiProviderName, { text: string | null; image: string }>;

/** Nome da variável de ambiente que sobrescreve o padrão do código, por provedor/tipo. */
export const MODEL_ENV_VARS = {
  OPENAI: { text: "OPENAI_TEXT_MODEL", image: "OPENAI_IMAGE_MODEL" },
  GEMINI: { text: "GEMINI_TEXT_MODEL", image: "GEMINI_IMAGE_MODEL" },
  GROK: { text: "GROK_TEXT_MODEL", image: "GROK_IMAGE_MODEL" },
  STABILITY: { text: null, image: "STABILITY_IMAGE_MODEL" },
  OPENROUTER: { text: "OPENROUTER_DEFAULT_MODEL", image: "OPENROUTER_IMAGE_DEFAULT_MODEL" },
} as const satisfies Record<AiProviderName, { text: string | null; image: string }>;

export type ModelKind = "text" | "image";

/**
 * Configuração de modelo salva pelo usuário no painel (espelha a tabela
 * `ai_model_settings`). O modelo só vale para o provedor gravado ao lado
 * dele — um ID do OpenRouter ("deepseek/...") nunca é enviado ao Gemini.
 */
export interface AiModelSettings {
  textProvider?: AiProviderName | null;
  textModel?: string | null;
  imageProvider?: AiProviderName | null;
  imageModel?: string | null;
  /** Nome amigável do catálogo, gravado ao salvar (só para exibição; nulo → a tela mostra o ID). */
  textModelName?: string | null;
  imageModelName?: string | null;
}

export type ModelOrigem = "painel" | "env" | "padrao";

type EnvLike = Record<string, string | undefined>;

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Como `resolveModelId`, mas também diz de onde o valor veio (para a tela mostrar). */
export function resolveModel(
  kind: ModelKind,
  provider: AiProviderName,
  settings?: AiModelSettings | null,
  env?: EnvLike
): { modelId: string; origem: ModelOrigem } {
  env ??= process.env;
  const painelProvider = kind === "text" ? settings?.textProvider : settings?.imageProvider;
  const painelModel = clean(kind === "text" ? settings?.textModel : settings?.imageModel);
  if (painelModel && painelProvider === provider) return { modelId: painelModel, origem: "painel" };

  const envVar = MODEL_ENV_VARS[provider][kind];
  const envModel = envVar ? clean(env[envVar]) : null;
  if (envModel) return { modelId: envModel, origem: "env" };

  const fallback = CODE_DEFAULT_MODELS[provider][kind];
  if (!fallback) throw new Error(`O provedor ${provider} não oferece modelo de ${kind === "text" ? "texto" : "imagem"}.`);
  return { modelId: fallback, origem: "padrao" };
}

/** Ordem de prioridade: painel → env → padrão do código. Nulo/vazio cai para o próximo nível. */
export function resolveModelId(
  kind: ModelKind,
  provider: AiProviderName,
  settings?: AiModelSettings | null,
  env: EnvLike = process.env
): string {
  return resolveModel(kind, provider, settings, env).modelId;
}

/**
 * Mantido por compatibilidade (valores env → padrão, calculados na carga do
 * módulo). Código novo deve usar `resolveModelId`, que relê a env a cada
 * chamada e considera a configuração do painel.
 */
export const AI_MODELS = {
  openai: { text: resolveModelId("text", "OPENAI"), image: resolveModelId("image", "OPENAI") },
  gemini: { text: resolveModelId("text", "GEMINI"), image: resolveModelId("image", "GEMINI") },
  grok: { text: resolveModelId("text", "GROK"), image: resolveModelId("image", "GROK") },
  stability: { image: resolveModelId("image", "STABILITY") },
  openrouter: { text: resolveModelId("text", "OPENROUTER"), image: resolveModelId("image", "OPENROUTER") },
} as const;
