import { Redis } from "ioredis";
import { instrumentRedisCommandCounts } from "@wordbee/shared";

/**
 * Conexão Redis do worker — usada pelo semáforo de concorrência por
 * provedor de IA (`provider-concurrency.ts`) e pelo heartbeat de saúde. O
 * lock de execução por linha NÃO usa mais Redis desde a migração do
 * scheduler para cron+Postgres (ver DECISIONS.md "scheduler cron+Postgres"
 * e `postgres-line-lock.ts`). Lê `REDIS_URL` do ambiente do worker
 * (EasyPanel/VPS), que precisa ser EXATAMENTE a mesma `REDIS_URL`
 * configurada no ambiente do web (Vercel) — é o mesmo Redis físico dos dois
 * lados, só a variável de ambiente é lida separadamente em cada host.
 *
 * Instrumentada com `instrumentRedisCommandCounts` (ver DECISIONS.md
 * "contador de comandos Redis por categoria") para acompanhar consumo real
 * de comandos Upstash direto no log estruturado do worker.
 */
export function createRedisConnection(): Redis {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL não configurada.");
  }
  return instrumentRedisCommandCounts(new Redis(url, { maxRetriesPerRequest: null }));
}
