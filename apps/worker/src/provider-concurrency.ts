import type { Redis } from "ioredis";

// ESCOPO: este semáforo protege só a concorrência de Linhas de Produção
// executadas pelo worker (RF-30 do PRD é explícito: "o agendador limita
// execuções simultâneas por provedor de IA" — é sobre o agendador, não
// sobre qualquer chamada de IA do sistema). `withProviderSlot` só é
// chamado a partir de `line-pipeline.ts`. A geração unitária ("Criar
// Artigo", `apps/web/src/lib/article-pipeline.ts`) roda inteiramente no
// processo web e NÃO passa por aqui — nem poderia sem um import cross-
// package deliberado, já que este módulo vive só em `apps/worker`, não em
// `@wordbee/shared`. Isso é esperado, não um bug: gerar um artigo manual
// pela tela não move a chave `provider-slot:<provider>`, e a geração
// unitária não tem (nem precisa ter) limite de concorrência próprio — é
// sempre uma única chamada síncrona por requisição do usuário, sem fila.
// Se um dia a geração unitária precisar competir pelo mesmo limite
// (ex.: rodar Criar Artigo enquanto várias linhas estão ativas, todas no
// mesmo provedor), isso exige mover este módulo para @wordbee/shared e
// chamá-lo também de article-pipeline.ts — não implementado, fora do
// escopo do que foi pedido até agora. Ver DECISIONS.md (auditoria de
// 2026-08-31, "esclarecimento de escopo do semáforo").
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

// DECR atômico com clamp em 0 e TTL sempre renovado — a versão anterior
// liberava com um `redis.decr(key)` puro (sem script, sem EXPIRE). Se a
// chamada de IA levasse mais tempo que SLOT_TTL_SECONDS, a chave já tinha
// expirado quando este release rodava; um DECR isolado recria a chave do
// zero em -1, SEM TTL (DECR nunca define expiração sozinho) — chave
// "vazada" permanentemente, incapaz de se autocorrigir. Foi exatamente o
// bug real encontrado ao vivo em produção em 2026-08-29 (GET retornou -2,
// TTL -1) e reaberto pela liberação nunca ter sido migrada para o script
// atômico junto com a aquisição. Agora: nunca fica negativo (clamp em 0) e
// sempre ganha um TTL novo, mesmo partindo de uma chave ausente/expirada —
// se algo ainda assim ficar "manco" (ex.: processo morre entre acquire e
// release), o TTL garante que se autocorrige sozinho em até SLOT_TTL_SECONDS.
const RELEASE_SCRIPT = `
local count = redis.call('DECR', KEYS[1])
if count < 0 then
  redis.call('SET', KEYS[1], 0)
  count = 0
end
redis.call('EXPIRE', KEYS[1], ARGV[1])
return count
`;

function getMaxConcurrent(): number {
  return Number(process.env.AI_PROVIDER_CONCURRENCY ?? "3");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function providerSlotKey(provider: string): string {
  return `provider-slot:${provider.toLowerCase()}`;
}

export async function acquireProviderSlot(redis: Redis, provider: string): Promise<boolean> {
  const key = providerSlotKey(provider);
  const maxConcurrent = getMaxConcurrent();
  const acquired = await redis.eval(TRY_ACQUIRE_SCRIPT, 1, key, maxConcurrent, SLOT_TTL_SECONDS);
  return acquired === 1;
}

export async function releaseProviderSlot(redis: Redis, provider: string): Promise<void> {
  const key = providerSlotKey(provider);
  await redis.eval(RELEASE_SCRIPT, 1, key, SLOT_TTL_SECONDS);
}

/**
 * Limita quantas chamadas simultâneas de IA por provedor rodam ao mesmo
 * tempo entre todas as linhas ativas (RF-30), para não estourar rate
 * limit com muitas linhas rodando em paralelo. Espera (poll curto) até
 * conseguir uma vaga em vez de falhar a execução.
 */
export async function withProviderSlot<T>(redis: Redis, provider: string, fn: () => Promise<T>): Promise<T> {
  for (;;) {
    if (await acquireProviderSlot(redis, provider)) {
      try {
        return await fn();
      } finally {
        await releaseProviderSlot(redis, provider);
      }
    }
    await sleep(800 + Math.random() * 800);
  }
}
