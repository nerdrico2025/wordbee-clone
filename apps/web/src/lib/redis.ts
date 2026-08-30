import { Redis } from "ioredis";

let client: Redis | undefined;

/**
 * Cliente Redis do processo web, usado para rate limiting de login e para
 * ler o heartbeat/último-sucesso do worker (badge de saúde no Dashboard —
 * ver `getWorkerHealth` em `@wordbee/shared`). Desde a migração do
 * scheduler de Linhas de Produção para cron+Postgres (ver DECISIONS.md
 * "scheduler cron+Postgres", 2026-08-30), o web não agenda nem cancela mais
 * nada no Redis — `production-lines.ts` só escreve `status`/`nextRunAt`
 * direto no Postgres, e o worker reivindica sozinho.
 *
 * Ainda assim, `REDIS_URL` aqui precisa apontar pro MESMO Redis usado pelo
 * worker (`apps/worker/src/redis.ts`) — é de lá que vem o heartbeat que o
 * badge do Dashboard lê.
 */
export function getRedis(): Redis {
  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL não configurada.");
    client = new Redis(url, { maxRetriesPerRequest: null });
  }
  return client;
}
