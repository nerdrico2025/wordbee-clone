import type { Redis } from "ioredis";

const SLOT_TTL_SECONDS = 300;

// INCR + EXPIRE condicional + DECR condicional, tudo num único round-trip
// (EVAL = 1 comando faturado pelo Upstash, contra 2-3 comandos separados da
// versão anterior). Mesma semântica de antes: incrementa sempre, expira só
// na primeira vez que a chave é criada, desfaz o incremento se estourou o
// limite. Coberto por provider-concurrency.test.ts (inclusive o caso de
// espera sob concorrência). Ver DECISIONS.md "redução de comandos Redis"
// (2026-08-29).
const TRY_ACQUIRE_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
end
if count > tonumber(ARGV[1]) then
  redis.call('DECR', KEYS[1])
  return 0
end
return 1
`;

function getMaxConcurrent(): number {
  return Number(process.env.AI_PROVIDER_CONCURRENCY ?? "3");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryAcquire(redis: Redis, key: string, maxConcurrent: number): Promise<boolean> {
  const acquired = await redis.eval(TRY_ACQUIRE_SCRIPT, 1, key, maxConcurrent, SLOT_TTL_SECONDS);
  return acquired === 1;
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
    if (await tryAcquire(redis, key, maxConcurrent)) {
      try {
        return await fn();
      } finally {
        await redis.decr(key);
      }
    }
    await sleep(800 + Math.random() * 800);
  }
}
