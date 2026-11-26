import { prisma } from "@wordbee/db";
import type { AiModelSettings } from "@wordbee/shared";

/**
 * Configuração de modelo de IA salva no painel (Chaves de API → Modelos de
 * IA), lida pelo worker a cada execução de linha — nunca exige restart do
 * container. Cache em memória de no máximo 60s por usuário: o tick do
 * scheduler é de 90s, então na prática cada tick já vê o valor mais recente,
 * e várias linhas do mesmo usuário no mesmo tick compartilham uma leitura.
 * Ver DECISIONS.md "modelo de IA configurável pelo painel" (2026-11-25).
 */
export const AI_MODEL_SETTINGS_CACHE_MS = Math.min(Number(process.env.AI_MODEL_SETTINGS_CACHE_MS ?? "60000"), 60_000);

const cache = new Map<string, { value: AiModelSettings | null; expiresAt: number }>();

export function clearAiModelSettingsCache(): void {
  cache.clear();
}

export async function getAiModelSettings(userId: string, now: number = Date.now()): Promise<AiModelSettings | null> {
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > now) return hit.value;

  try {
    const row = await prisma.aiModelSettings.findUnique({
      where: { userId },
      select: { textProvider: true, textModel: true, imageProvider: true, imageModel: true },
    });
    const value = (row as AiModelSettings | null) ?? null;
    cache.set(userId, { value, expiresAt: now + AI_MODEL_SETTINGS_CACHE_MS });
    return value;
  } catch (err) {
    // Falha ao ler a configuração nunca pode parar a produção de artigos:
    // usa o último valor conhecido (ou env/padrão, se nunca leu).
    console.error(`[ai-model-settings] falha ao ler configuração do usuário ${userId}; usando último valor conhecido:`, err);
    return hit?.value ?? null;
  }
}
