import { Redis } from "ioredis";
import { instrumentRedisCommandCounts } from "@wordbee/shared";

/**
 * Conexão Redis do worker — usada pelo BullMQ Worker (consumidor da fila),
 * pelo lock por linha e pelo heartbeat. Lê `REDIS_URL` do ambiente do
 * worker (EasyPanel/Railway/VPS), que precisa ser EXATAMENTE a mesma
 * `REDIS_URL` configurada no ambiente do web (Vercel) — é o mesmo Redis
 * físico dos dois lados, só a variável de ambiente é lida separadamente em
 * cada host. Ver DECISIONS.md e `packages/shared/src/queue/index.ts`.
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
