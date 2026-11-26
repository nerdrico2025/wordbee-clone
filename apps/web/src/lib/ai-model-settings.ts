import "server-only";
import { prisma } from "@wordbee/db";
import { fetchOpenRouterCatalog, resolveModel } from "@wordbee/shared";
import type { AiModelSettings, ModelKind, ModelOrigem, OpenRouterModelInfo } from "@wordbee/shared";

/**
 * Modelos de IA configuráveis pelo painel (Chaves de API → Modelos de IA).
 * Por enquanto só o OpenRouter é configurável pela tela; os demais
 * provedores seguem env → padrão do código. Ver DECISIONS.md "modelo de IA
 * configurável pelo painel" (2026-11-25).
 */
export const CONFIGURABLE_PROVIDER = "OPENROUTER" as const;

/** Lida a cada geração (sem cache): trocar no painel vale na próxima geração. */
export async function getAiModelSettings(userId: string): Promise<AiModelSettings | null> {
  return prisma.aiModelSettings.findUnique({
    where: { userId },
    select: { textProvider: true, textModel: true, imageProvider: true, imageModel: true },
  });
}

export interface AiModelSlotView {
  /** O que está salvo no painel (null = usando o padrão). */
  salvo: string | null;
  /** O modelo que de fato será usado na próxima geração com OpenRouter. */
  emUso: string;
  origem: ModelOrigem;
  /** O que "Voltar ao padrão" passaria a usar (env → código). */
  padrao: string;
}

export interface AiModelsView {
  provedor: typeof CONFIGURABLE_PROVIDER;
  texto: AiModelSlotView;
  imagem: AiModelSlotView;
}

function slot(kind: ModelKind, settings: AiModelSettings | null): AiModelSlotView {
  const atual = resolveModel(kind, CONFIGURABLE_PROVIDER, settings);
  const padrao = resolveModel(kind, CONFIGURABLE_PROVIDER, null);
  const salvoProvider = kind === "text" ? settings?.textProvider : settings?.imageProvider;
  const salvoModel = kind === "text" ? settings?.textModel : settings?.imageModel;
  return {
    salvo: salvoProvider === CONFIGURABLE_PROVIDER && salvoModel ? salvoModel : null,
    emUso: atual.modelId,
    origem: atual.origem,
    padrao: padrao.modelId,
  };
}

export function toAiModelsView(settings: AiModelSettings | null): AiModelsView {
  return { provedor: CONFIGURABLE_PROVIDER, texto: slot("text", settings), imagem: slot("image", settings) };
}

export async function getAiModelsView(userId: string): Promise<AiModelsView> {
  return toAiModelsView(await getAiModelSettings(userId));
}

/** `null`/ausente = voltar ao padrão daquele tipo. */
export async function saveAiModelSettings(
  userId: string,
  input: { textModel?: string | null; imageModel?: string | null }
): Promise<AiModelsView> {
  const data = {
    textProvider: input.textModel ? CONFIGURABLE_PROVIDER : null,
    textModel: input.textModel ?? null,
    imageProvider: input.imageModel ? CONFIGURABLE_PROVIDER : null,
    imageModel: input.imageModel ?? null,
  };
  const row = await prisma.aiModelSettings.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return toAiModelsView(row);
}

// --- Catálogo do OpenRouter (cache de 10 min em memória por instância)

export const CATALOG_CACHE_MS = 10 * 60_000;

const catalogCache = new Map<ModelKind, { modelos: OpenRouterModelInfo[]; expiresAt: number }>();

export function clearCatalogCache(): void {
  catalogCache.clear();
}

/**
 * O catálogo é público (igual para qualquer chave), por isso o cache é por
 * tipo, não por usuário. Falha nunca é cacheada — a próxima abertura da tela
 * tenta de novo. Em serverless (Vercel), cada instância tem o seu cache;
 * no pior caso, uma busca a mais a cada 10 min por instância.
 */
export async function getOpenRouterCatalog(kind: ModelKind, apiKey: string | null, now: number = Date.now()): Promise<OpenRouterModelInfo[]> {
  const hit = catalogCache.get(kind);
  if (hit && hit.expiresAt > now) return hit.modelos;
  const modelos = await fetchOpenRouterCatalog(kind, apiKey ?? undefined);
  modelos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  catalogCache.set(kind, { modelos, expiresAt: now + CATALOG_CACHE_MS });
  return modelos;
}
