import type { Redis } from "ioredis";

const SLOT_TTL_SECONDS = 300;

function getMaxConcurrent(): number {
  return Number(process.env.AI_PROVIDER_CONCURRENCY ?? "3");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Limita quantas chamadas simultâneas de IA por provedor rodam ao mesmo
 * tempo entre todas as linhas ativas (RF-30), para não estourar rate
 * limit com muitas linhas rodando em paralelo. Espera (poll curto) até
 * conseguir uma vaga em vez de falhar a execução.
 */
export async function withProviderSlot<T>(redis: Redis, provider: string, fn: () => Promise<T>): Promise<T> {
  const key = `provider-slot:${provider.toLowerCase()}`;
  const maxConcurrent = getMaxConcurrent();
  for (;;) {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, SLOT_TTL_SECONDS);
    if (count <= maxConcurrent) {
      try {
        return await fn();
      } finally {
        await redis.decr(key);
      }
    }
    await redis.decr(key);
    await sleep(800 + Math.random() * 800);
  }
}
