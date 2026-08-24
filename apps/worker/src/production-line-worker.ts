import { Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { prisma } from "@wordbee/db";
import { PRODUCTION_LINE_QUEUE_NAME, scheduleLineRun, getProductionLineQueue, type ProductionLineJobData } from "@wordbee/shared";
import { acquireLineLock, releaseLineLock } from "./lock.js";
import { runProductionLine } from "./line-pipeline.js";

const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? "5");

export function startProductionLineWorker(connection: Redis): Worker<ProductionLineJobData> {
  const worker = new Worker<ProductionLineJobData>(
    PRODUCTION_LINE_QUEUE_NAME,
    async (job: Job<ProductionLineJobData>) => {
      const { lineId } = job.data;
      const locked = await acquireLineLock(connection, lineId);
      if (!locked) {
        console.log(`[worker] linha ${lineId} já está em execução em outro processo — pulando este tick.`);
        return;
      }
      try {
        await runProductionLine(connection, lineId, ({ event, detail }) => {
          console.log(`[worker] linha=${lineId} evento=${event}${detail ? ` detail=${detail}` : ""}`);
        });
      } finally {
        await releaseLineLock(connection, lineId);
      }
    },
    { connection, concurrency: WORKER_CONCURRENCY }
  );

  worker.on("failed", (job, err) => {
    console.error(`[worker] job da linha ${job?.data.lineId} falhou inesperadamente:`, err);
  });

  return worker;
}

/**
 * Garante que toda linha ATIVA tenha um job agendado na fila. Necessário
 * porque, embora jobs delayed sobrevivam a restart do worker (persistidos
 * no Redis), uma linha pode ficar "órfã" se o Redis foi limpo ou se ela
 * foi ativada enquanto o worker estava fora do ar.
 */
export async function syncActiveLines(): Promise<void> {
  const queue = getProductionLineQueue();
  const activeLines = await prisma.productionLine.findMany({ where: { status: "ATIVA" } });

  for (const line of activeLines) {
    const existingJob = await queue.getJob(line.id);
    if (existingJob) continue;

    const delayMs = line.nextRunAt ? Math.max(0, line.nextRunAt.getTime() - Date.now()) : 0;
    await scheduleLineRun(line.id, delayMs);
    console.log(`[worker] linha ${line.id} (${line.nome}) reagendada após sincronização de startup.`);
  }
}
