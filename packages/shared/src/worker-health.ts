import type { Redis } from "ioredis";

const HEARTBEAT_KEY = "worker:heartbeat";
const LAST_SUCCESS_KEY = "worker:last_success";
const HEARTBEAT_TTL_SECONDS = 90;

/** Chamado periodicamente pelo worker enquanto estiver de pé. A chave expira sozinha se parar de bater. */
export async function recordHeartbeat(redis: Redis): Promise<void> {
  await redis.set(HEARTBEAT_KEY, Date.now().toString(), "EX", HEARTBEAT_TTL_SECONDS);
}

/** Chamado pelo worker sempre que um artigo é publicado com sucesso. */
export async function recordLastSuccess(redis: Redis): Promise<void> {
  await redis.set(LAST_SUCCESS_KEY, Date.now().toString());
}

export interface WorkerHealth {
  online: boolean;
  lastSuccessAt: Date | null;
}

/** Lido pelo dashboard do app web para mostrar o indicador de saúde do worker. */
export async function getWorkerHealth(redis: Redis): Promise<WorkerHealth> {
  const [heartbeat, lastSuccess] = await Promise.all([redis.get(HEARTBEAT_KEY), redis.get(LAST_SUCCESS_KEY)]);
  return {
    online: !!heartbeat,
    lastSuccessAt: lastSuccess ? new Date(Number(lastSuccess)) : null,
  };
}
