import type { Redis } from "ioredis";

/**
 * Contador em memória de comandos Redis por nome de comando (incr, get,
 * evalsha, ...), usado só para instrumentação/observabilidade — nunca lido
 * de volta do Redis, então não gera nenhum comando adicional. Estado global
 * do processo (por design: cada processo — worker, ou uma invocação
 * serverless do web — tem sua própria contagem isolada; nada é persistido
 * nem compartilhado entre processos).
 *
 * Envolve `redis.sendCommand`, o ponto por onde TODO comando do ioredis
 * passa (inclusive scripts Lua via EVAL/EVALSHA, que aparecem aqui como
 * "evalsha"/"eval") — é a mesma técnica usada por bibliotecas de APM
 * (Sentry/Datadog) pra instrumentar ioredis sem tocar no protocolo. Ver
 * DECISIONS.md "contador de comandos Redis por categoria".
 *
 * Também envolvemos `redis.duplicate` abaixo: qualquer biblioteca que abra
 * conexões próprias via `connection.duplicate(...)` (ioredis cria uma
 * instância `Redis` nova nesse caso, que não herdaria o `sendCommand`
 * sobrescrito aqui) continua tendo seus comandos contados. Adicionado
 * originalmente por causa do BullMQ (removido do projeto em 2026-08-30, ver
 * DECISIONS.md "scheduler cron+Postgres" — seu `Worker` usava
 * `duplicate()` para o long-poll `BZPOPMIN` de jobs delayed), mantido por
 * ser uma proteção genérica e barata.
 */
const counts: Record<string, number> = {};

export function instrumentRedisCommandCounts(redis: Redis): Redis {
  const original = redis.sendCommand.bind(redis);
  redis.sendCommand = ((command: { name?: string }, ...rest: unknown[]) => {
    const name = command?.name ?? "unknown";
    counts[name] = (counts[name] ?? 0) + 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (original as any)(command, ...rest);
  }) as typeof redis.sendCommand;

  const originalDuplicate = redis.duplicate.bind(redis);
  redis.duplicate = ((...args: Parameters<typeof redis.duplicate>) => {
    const dup = originalDuplicate(...args);
    return instrumentRedisCommandCounts(dup);
  }) as typeof redis.duplicate;

  return redis;
}

export function snapshotRedisCommandCounts(): Record<string, number> {
  return { ...counts };
}

export function resetRedisCommandCounts(): void {
  for (const key of Object.keys(counts)) delete counts[key];
}
