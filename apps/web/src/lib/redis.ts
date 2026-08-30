import { Redis } from "ioredis";

let client: Redis | undefined;

/**
 * Cliente Redis do processo web, usado para rate limiting (Node.js runtime
 * only). Lê a MESMA variável `REDIS_URL` que `packages/shared/src/queue/index.ts`
 * usa para agendar/cancelar jobs do BullMQ (`scheduleLineRun`/`cancelLineRun`,
 * chamados por `production-lines.ts`) — são conexões `ioredis` separadas,
 * mas apontam para o mesmo Redis por design (uma única instância pra tudo,
 * ver DECISIONS.md "REDIS_URL única para fila BullMQ e rate limit").
 *
 * Web (Vercel) e worker (`apps/worker/src/redis.ts`) SEMPRE precisam ter
 * `REDIS_URL` apontando pro mesmo Redis — web enfileira os jobs, worker os
 * consome; se divergirem, o worker nunca vê os jobs que o web agenda (bug
 * real já visto em produção: worker no EasyPanel apontando pra um Redis
 * diferente do REDIS_URL configurado na Vercel).
 */
export function getRedis(): Redis {
  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL não configurada.");
    client = new Redis(url, { maxRetriesPerRequest: null });
  }
  return client;
}
