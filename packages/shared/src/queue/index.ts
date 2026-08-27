import { Queue, type Job } from "bullmq";
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
 *
 * Web e worker rodam em processos/hosts diferentes (web na Vercel, worker
 * em serviço always-on separado — Railway/EasyPanel/VPS) e cada lado lê seu
 * próprio `process.env.REDIS_URL` para abrir esta conexão. Produtor (web,
 * via `scheduleLineRun`/`cancelLineRun`) e consumidor (worker, via
 * `startProductionLineWorker`/`syncActiveLines` em `apps/worker`) só se
 * encontram na mesma fila BullMQ se as duas `REDIS_URL` apontarem pro
 * MESMO Redis — não há verificação em runtime disso, uma divergência falha
 * silenciosamente (jobs agendados pelo web nunca são consumidos, sem erro
 * visível em nenhum dos dois lados). Ver DECISIONS.md.
 */
export function getProductionLineQueue(): Queue<ProductionLineJobData> {
  if (!queue) {
    queue = new Queue<ProductionLineJobData>(PRODUCTION_LINE_QUEUE_NAME, { connection: getConnection() });
  }
  return queue;
}

/**
 * Retorna o `Job` recém-criado (não só `void`) e loga o resultado do
 * `q.add()` — id/delay confirmados pelo próprio BullMQ, não só os valores
 * pedidos — para dar visibilidade real de que o job foi de fato criado no
 * Redis, não só que a chamada não lançou. Instrumentação adicionada durante
 * a investigação de 2026-08-27 (linhas ficando sem job vivo entre execuções
 * mesmo com o fix de reagendamento aplicado) — ver DECISIONS.md.
 */
export async function scheduleLineRun(lineId: string, delayMs: number): Promise<Job<ProductionLineJobData>> {
  const q = getProductionLineQueue();
  await cancelLineRun(lineId);
  const job = await q.add(
    "run",
    { lineId },
    { jobId: lineId, delay: Math.max(0, delayMs), removeOnComplete: true, removeOnFail: 1000 }
  );
  const estadoConfirmado = await job.getState().catch((err) => {
    console.error(`[queue] falha ao confirmar estado do job recém-criado da linha ${lineId}:`, err);
    return "desconhecido";
  });
  console.log(
    JSON.stringify({
      evento: "queue_add",
      linha: lineId,
      jobId: job.id,
      delayMsPedido: Math.max(0, delayMs),
      delayMsConfirmado: job.opts.delay,
      estadoConfirmado,
    })
  );
  return job;
}

/**
 * Remove qualquer job existente com jobId = lineId, MENOS um job realmente
 * "active" (rodando agora). Precisa cobrir todo estado que não seja active —
 * não só "delayed"/"waiting" — porque um job "completed" ou "failed" que não
 * foi limpo (ex.: removeOnFail mantém os últimos N) continua ocupando esse
 * jobId: o BullMQ ignora silenciosamente um `add()` com um jobId que já
 * existe em QUALQUER estado, então scheduleLineRun ficaria bloqueado pra
 * sempre por um job morto sem isso. Ver DECISIONS.md.
 */
export async function cancelLineRun(lineId: string): Promise<void> {
  const q = getProductionLineQueue();
  const job = await q.getJob(lineId);
  if (!job) return;
  const state = await job.getState();
  console.log(JSON.stringify({ evento: "cancel_line_run_job_encontrado", linha: lineId, jobIdEncontrado: job.id, estado: state }));
  if (state === "active") return; // job de verdade em execução — nunca remove

  try {
    await job.remove();
    console.log(JSON.stringify({ evento: "cancel_line_run_job_removido", linha: lineId, jobIdEncontrado: job.id, estadoAnterior: state }));
  } catch (err) {
    // Corrida: o job pode ter virado "active" entre o getState() acima e
    // este remove() (ex.: o delay expirou nesse meio tempo e o worker
    // pegou o job). Nesse caso ele está rodando de verdade — não é um job
    // morto — e o scheduleLineRun que chamou isto vai colidir ao tentar
    // recriar o job, o que é o comportamento certo aqui: o reagendamento
    // real acontece de qualquer forma no handler completed/failed assim
    // que esse job terminar.
    console.error(`[queue] falha ao remover job existente da linha ${lineId} antes de reagendar:`, err);
  }
}

export async function closeProductionLineQueue(): Promise<void> {
  await queue?.close();
  await connection?.quit();
}
