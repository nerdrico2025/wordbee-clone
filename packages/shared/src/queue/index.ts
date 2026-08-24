import { Queue } from "bullmq";
import { Redis } from "ioredis";

export const PRODUCTION_LINE_QUEUE_NAME = "production-line-run";

export interface ProductionLineJobData {
  lineId: string;
}

let connection: Redis | undefined;
let queue: Queue<ProductionLineJobData> | undefined;

function getConnection(): Redis {
  if (!connection) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL não configurada.");
    connection = new Redis(url, { maxRetriesPerRequest: null });
  }
  return connection;
}

/**
 * Fila compartilhada entre web (agenda/cancela ao criar/editar/pausar/excluir
 * uma linha) e worker (processa e reagenda a próxima execução). jobId =
 * lineId garante no máximo uma execução pendente por linha na fila.
 */
export function getProductionLineQueue(): Queue<ProductionLineJobData> {
  if (!queue) {
    queue = new Queue<ProductionLineJobData>(PRODUCTION_LINE_QUEUE_NAME, { connection: getConnection() });
  }
  return queue;
}

export async function scheduleLineRun(lineId: string, delayMs: number): Promise<void> {
  const q = getProductionLineQueue();
  await cancelLineRun(lineId);
  await q.add(
    "run",
    { lineId },
    { jobId: lineId, delay: Math.max(0, delayMs), removeOnComplete: true, removeOnFail: 1000 }
  );
}

export async function cancelLineRun(lineId: string): Promise<void> {
  const q = getProductionLineQueue();
  const job = await q.getJob(lineId);
  if (!job) return;
  const state = await job.getState();
  if (state === "delayed" || state === "waiting") {
    await job.remove();
  }
}

export async function closeProductionLineQueue(): Promise<void> {
  await queue?.close();
  await connection?.quit();
}
