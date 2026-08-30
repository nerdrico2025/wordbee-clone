import { randomUUID } from "node:crypto";
import { Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { prisma } from "@wordbee/db";
import {
  PRODUCTION_LINE_QUEUE_NAME,
  scheduleLineRun,
  getProductionLineQueue,
  recordLastSuccess,
  snapshotRedisCommandCounts,
  type ProductionLineJobData,
} from "@wordbee/shared";
import { acquireLineLock, releaseLineLock } from "./lock.js";
import { runProductionLine } from "./line-pipeline.js";

const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? "5");

// BullMQ renova o lock de todo job "active" a cada `lockDuration / 2` e
// varre jobs travados a cada `stalledInterval` — os DOIS rodam sozinhos,
// pelo Worker, o tempo todo (inclusive parado sem nenhum job ativo), e cada
// execução é 1 comando Redis (script Lua). Com o default do BullMQ
// (lockDuration=30s → renova a cada 15s; stalledInterval=30s) isso sozinho
// já soma ~2 comandos/min = ~86 mil/mês rodando o tempo todo, mesmo ocioso —
// foi uma das maiores fontes de comandos "de fundo" identificadas na
// investigação do aviso de limite do Upstash (ver DECISIONS.md
// "redução de comandos Redis", 2026-08-29). Geração de artigo (texto+imagem+
// upload WP, com retries) pode legitimamente levar minutos, então
// lockDuration curto não ajuda em nada na prática — o lock é renovado
// automaticamente enquanto o processo estiver vivo; só importa (mais
// devagar) na recuperação de um worker que travou/morreu de verdade, o que
// aqui já tem uma rede de segurança separada em `syncActiveLines()` no
// boot. Valores maiores = 4x menos comandos de fundo, com detecção de job
// travado mais lenta (worst case ~4min em vez de ~1min) — aceitável para
// esta app de usuário único.
const LOCK_DURATION_MS = Number(process.env.WORKER_LOCK_DURATION_MS ?? "120000");
const STALLED_INTERVAL_MS = Number(process.env.WORKER_STALLED_INTERVAL_MS ?? "120000");

/**
 * Id único por processo, gerado uma vez na carga do módulo e incluído em
 * todo log estruturado deste arquivo. Instrumentação adicionada em
 * 2026-08-27 especificamente para responder "há mais de uma instância do
 * worker rodando ao mesmo tempo (ex.: 2 réplicas no EasyPanel)?" — se dois
 * `workerId` diferentes aparecerem intercalados no mesmo stream de log, é
 * prova direta de múltiplas instâncias competindo pela mesma fila. Ver
 * DECISIONS.md.
 */
const WORKER_INSTANCE_ID = randomUUID();
console.log(JSON.stringify({ evento: "worker_instancia_iniciada", workerId: WORKER_INSTANCE_ID, pid: process.pid, iniciadoEm: new Date().toISOString() }));

/**
 * Reagenda a próxima execução da linha na fila, se ainda fizer sentido.
 *
 * Só deve ser chamada depois que o job atual (jobId = lineId) já saiu da
 * fila — nunca de dentro do processor, enquanto o job ainda está "active"
 * (ver comentário em line-pipeline.ts e DECISIONS.md). Os handlers
 * "completed"/"failed" do BullMQ satisfazem essa condição: com
 * removeOnComplete/removeOnFail, o job já foi removido antes do evento
 * disparar, então o jobId está livre para o próximo scheduleLineRun.
 *
 * Loga explicitamente ANTES e DEPOIS de chamar scheduleLineRun — se o log
 * "antes" nunca aparecer entre um "tick_concluido" e o próximo restart, o
 * handler completed/failed não está sendo disparado (bug de registro do
 * listener, ou Worker duplicado). Se "antes" aparecer mas "depois" não,
 * scheduleLineRun travou ou lançou. Se "depois" aparecer com sucesso,
 * conferir o log "queue_add" (emitido dentro de scheduleLineRun, em
 * packages/shared/src/queue/index.ts) para confirmar que o BullMQ de fato
 * criou o job novo — essa é a fonte de verdade final.
 */
async function rescheduleIfNeeded(lineId: string, origem: "completed" | "failed"): Promise<void> {
  const line = await prisma.productionLine.findUnique({ where: { id: lineId } });
  if (!line || line.status !== "ATIVA" || !line.nextRunAt) {
    console.log(
      JSON.stringify({
        evento: "reschedule_pos_completed_pulado",
        origem,
        linha: lineId,
        workerId: WORKER_INSTANCE_ID,
        motivo: !line ? "linha_nao_encontrada" : line.status !== "ATIVA" ? `status_${line.status}` : "nextRunAt_nulo",
      })
    );
    return;
  }

  const delayMs = Math.max(0, line.nextRunAt.getTime() - Date.now());
  console.log(
    JSON.stringify({
      evento: "reschedule_pos_completed",
      fase: "antes",
      origem,
      linha: lineId,
      workerId: WORKER_INSTANCE_ID,
      nextRunAt: line.nextRunAt.toISOString(),
      delayMs,
    })
  );

  const job = await scheduleLineRun(lineId, delayMs);

  console.log(
    JSON.stringify({
      evento: "reschedule_pos_completed",
      fase: "depois",
      origem,
      linha: lineId,
      workerId: WORKER_INSTANCE_ID,
      jobIdCriado: job.id,
      delayMs,
    })
  );
}

export function startProductionLineWorker(connection: Redis): Worker<ProductionLineJobData> {
  const worker = new Worker<ProductionLineJobData>(
    PRODUCTION_LINE_QUEUE_NAME,
    async (job: Job<ProductionLineJobData>) => {
      const { lineId } = job.data;
      const startedAt = Date.now();

      const locked = await acquireLineLock(connection, lineId);
      if (!locked) {
        console.log(JSON.stringify({ linha: lineId, evento: "lock_ocupado", workerId: WORKER_INSTANCE_ID, mensagem: "já está em execução em outro processo" }));
        return;
      }

      let lastEvent = "sem_evento";
      try {
        await runProductionLine(connection, lineId, ({ event, detail }) => {
          lastEvent = event;
          console.log(JSON.stringify({ linha: lineId, evento: event, detalhe: detail, workerId: WORKER_INSTANCE_ID }));
          if (event === "publicado") {
            recordLastSuccess(connection).catch((err) => console.error("[worker] falha ao gravar last_success:", err));
          }
        });
      } finally {
        await releaseLineLock(connection, lineId);
        const duracaoMs = Date.now() - startedAt;
        console.log(JSON.stringify({ linha: lineId, evento: "tick_concluido", ultimoEvento: lastEvent, duracaoMs, workerId: WORKER_INSTANCE_ID }));
      }
    },
    { connection, concurrency: WORKER_CONCURRENCY, lockDuration: LOCK_DURATION_MS, stalledInterval: STALLED_INTERVAL_MS }
  );

  worker.on("completed", (job) => {
    if (!job) return;
    rescheduleIfNeeded(job.data.lineId, "completed").catch((err) =>
      console.error(`[worker] falha ao reagendar linha ${job.data.lineId} após completed:`, err)
    );
  });

  worker.on("failed", (job, err) => {
    console.error(`[worker] job da linha ${job?.data.lineId} falhou inesperadamente:`, err);
    if (!job) return;
    // Rede de segurança: hoje runProductionLine trata todo erro internamente
    // e sempre "completa", mas se algo escapar e o job cair aqui, ainda
    // assim garantimos que a linha não fique órfã na fila.
    rescheduleIfNeeded(job.data.lineId, "failed").catch((rescheduleErr) =>
      console.error(`[worker] falha ao reagendar linha ${job.data.lineId} após failed:`, rescheduleErr)
    );
  });

  return worker;
}

// Únicos estados em que um job com jobId=lineId realmente cobre a próxima
// execução da linha. Qualquer outro estado (completed, failed, paused,
// unknown, ...) é tratado como job morto — allow-list deliberada, não
// deny-list, para não presumir "vivo" por padrão num estado desconhecido.
const ALIVE_JOB_STATES = new Set(["waiting", "delayed", "active"]);

/**
 * Garante que toda linha ATIVA tenha um job agendado na fila. Necessário
 * porque, embora jobs delayed sobrevivam a restart do worker (persistidos
 * no Redis), uma linha pode ficar "órfã" se o Redis foi limpo, se ela foi
 * ativada enquanto o worker estava fora do ar, ou se o job anterior morreu
 * num estado "failed"/"completed" que não foi limpo (jobId=lineId ainda
 * ocupado — ver DECISIONS.md). Por isso não basta checar se existe ALGUM
 * job com esse jobId: precisa checar o ESTADO dele. Um job "waiting"/
 * "delayed"/"active" significa que a linha já está coberta de verdade — só
 * esses estados fazem `continue`. Qualquer outro estado é um job morto:
 * `scheduleLineRun` (via `cancelLineRun`) remove e recria.
 */
export async function syncActiveLines(): Promise<void> {
  const queue = getProductionLineQueue();
  const activeLines = await prisma.productionLine.findMany({ where: { status: "ATIVA" } });

  for (const line of activeLines) {
    const existingJob = await queue.getJob(line.id);
    if (existingJob) {
      const state = await existingJob.getState();
      console.log(
        JSON.stringify({ evento: "sync_job_existente", linha: line.id, nome: line.nome, workerId: WORKER_INSTANCE_ID, estado: state })
      );
      if (ALIVE_JOB_STATES.has(state)) continue;
      console.log(
        JSON.stringify({ evento: "sync_job_morto", linha: line.id, nome: line.nome, workerId: WORKER_INSTANCE_ID, estado: state })
      );
    }

    const delayMs = line.nextRunAt ? Math.max(0, line.nextRunAt.getTime() - Date.now()) : 0;
    const job = await scheduleLineRun(line.id, delayMs);
    console.log(
      JSON.stringify({
        evento: "sync_reagendada",
        linha: line.id,
        nome: line.nome,
        workerId: WORKER_INSTANCE_ID,
        jobIdCriado: job.id,
        delayMs,
      })
    );
  }
}

// Era 5 min (~78 mil comandos Redis/mês só com o getJobCounts deste log).
// Isso foi instrumentação de debug pontual pro bug de agendamento de
// 2026-08-27, que já está corrigido e coberto por teste de integração —
// não precisa mais desse nível de frequência para uma app de usuário único.
// 30 min ainda é o suficiente pra notar no stream de log do EasyPanel que o
// processo morreu. Ver DECISIONS.md "redução de comandos Redis" (2026-08-29).
const HEARTBEAT_LOG_INTERVAL_MS = Number(process.env.WORKER_HEARTBEAT_LOG_INTERVAL_MS ?? String(30 * 60_000));

/**
 * Log periódico de saúde do processo (distinto do heartbeat gravado no
 * Redis por `recordHeartbeat`, usado só pelo badge do Dashboard). Este é
 * pensado pra ser lido diretamente no stream de log do EasyPanel: se ele
 * parar de aparecer, o processo morreu (ou travou) sem reiniciar sozinho —
 * sinal de que falta configurar restart automático na infra, não um bug de
 * código. Instrumentação adicionada em 2026-08-27 (ver DECISIONS.md).
 *
 * Também loga `comandosRedis`, o snapshot acumulado (desde o boot do
 * processo) do contador em memória de `instrumentRedisCommandCounts` — não
 * gera nenhum comando Redis novo (é só leitura de um objeto local), e dá
 * visibilidade real de quantos comandos/de que tipo o worker está gerando,
 * sem depender só do aviso por e-mail do Upstash. Ver DECISIONS.md
 * "contador de comandos Redis por categoria".
 */
export function startHeartbeatLog(): NodeJS.Timeout {
  const logOnce = async () => {
    try {
      const queue = getProductionLineQueue();
      const [linhasAtivas, jobsNaFila] = await Promise.all([
        prisma.productionLine.count({ where: { status: "ATIVA" } }),
        queue.getJobCounts(),
      ]);
      console.log(
        JSON.stringify({
          evento: "heartbeat",
          workerId: WORKER_INSTANCE_ID,
          pid: process.pid,
          timestamp: new Date().toISOString(),
          linhasAtivas,
          jobsNaFila,
          comandosRedis: snapshotRedisCommandCounts(),
        })
      );
    } catch (err) {
      console.error("[worker] falha ao gravar heartbeat de log:", err);
    }
  };

  void logOnce();
  return setInterval(logOnce, HEARTBEAT_LOG_INTERVAL_MS);
}
