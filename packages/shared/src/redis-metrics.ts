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
 * passa (inclusive os disparados internamente pelo BullMQ via scripts Lua,
 * que aparecem aqui como "evalsha"/"eval") — é a mesma técnica usada por
 * bibliotecas de APM (Sentry/Datadog) pra instrumentar ioredis sem tocar no
 * protocolo. Ver DECISIONS.md "contador de comandos Redis por categoria".
 *
 * IMPORTANTE — cobertura parcial conhecida: o BullMQ `Worker` chama
 * internamente `connection.duplicate(...)` pra abrir conexões próprias (a
 * `blockingConnection` usada no long-poll de jobs delayed via `BZPOPMIN`, e
 * outras). `duplicate()` do ioredis cria uma instância `Redis` nova — não
 * herda o `sendCommand` sobrescrito aqui. Por isso também envolvemos
 * `redis.duplicate` abaixo, pra qualquer duplicata (inclusive as que o
 * BullMQ cria por baixo dos panos) continuar sendo contada. Ver
 * DECISIONS.md sobre o achado do long-poll de ~10s do BullMQ.
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
