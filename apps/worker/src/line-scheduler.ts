import type { Redis } from "ioredis";
import { recordLastSuccess } from "@wordbee/shared";
import { runProductionLine } from "./line-pipeline.js";
import { claimDueLines, releaseLine } from "./postgres-line-lock.js";

// Intervalos reais das linhas vão de 10 min a 24h (RF-29) — não há motivo
// para latência de disparo em segundos. 1-2 min de atraso máximo é
// imperceptível nessa escala e elimina por completo o custo de um worker
// long-poll always-on no Redis (BullMQ acordava a cada ~10s mesmo com filas
// ociosas — ver DECISIONS.md "scheduler cron+Postgres", 2026-08-30).
const SCHEDULER_INTERVAL_MS = Number(process.env.SCHEDULER_INTERVAL_MS ?? String(90_000));

// Mesmo valor usado antes como WORKER_CONCURRENCY do BullMQ: quantas linhas
// processar em paralelo por tick.
const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? "5");

export interface LineScheduler {
  stop(): Promise<void>;
}

/**
 * Substitui o `Worker` do BullMQ: em vez de consumir uma fila via long-poll
 * no Redis, faz polling periódico no Postgres (`claimDueLines`) e processa
 * o que estiver devido. Roda um tick imediatamente no boot (equivalente ao
 * antigo `syncActiveLines`, mas sem precisar de uma função de reconciliação
 * separada — a própria query de reivindicação já é auto-recuperável a cada
 * tick: uma linha órfã por causa de um lock velho, ou nunca agendada, é
 * pega normalmente assim que `nextRunAt` vencer). Ver DECISIONS.md.
 */
export function startLineScheduler(redis: Redis, workerId: string): LineScheduler {
  let ticking = false;
  let stopped = false;
  let inFlight: Promise<void> = Promise.resolve();

  async function processLine(line: { id: string }): Promise<void> {
    const startedAt = Date.now();
    let lastEvent = "sem_evento";
    try {
      await runProductionLine(redis, line.id, ({ event, detail }) => {
        lastEvent = event;
        console.log(JSON.stringify({ linha: line.id, evento: event, detalhe: detail, workerId }));
        if (event === "publicado") {
          recordLastSuccess(redis).catch((err) => console.error("[scheduler] falha ao gravar last_success:", err));
        }
      });
    } catch (err) {
      // Rede de segurança: runProductionLine já nunca deveria lançar (ver
      // line-pipeline.ts), mas se algo escapar mesmo assim, o `finally`
      // abaixo garante que o lock ainda é liberado — nunca deixa uma linha
      // presa por uma exceção inesperada aqui.
      console.error(`[scheduler] runProductionLine lançou inesperadamente para a linha ${line.id}:`, err);
    } finally {
      await releaseLine(line.id).catch((err) =>
        console.error(`[scheduler] falha ao liberar lock da linha ${line.id}:`, err)
      );
      console.log(
        JSON.stringify({ linha: line.id, evento: "tick_concluido", ultimoEvento: lastEvent, duracaoMs: Date.now() - startedAt, workerId })
      );
    }
  }

  async function tick(): Promise<void> {
    if (ticking) {
      console.log(JSON.stringify({ evento: "cron_tick_pulado", motivo: "tick_anterior_ainda_em_andamento", workerId }));
      return;
    }
    ticking = true;
    const startedAt = Date.now();
    try {
      const lines = await claimDueLines(workerId, WORKER_CONCURRENCY);
      if (lines.length > 0) {
        console.log(JSON.stringify({ evento: "cron_tick_reivindicadas", quantidade: lines.length, linhas: lines.map((l) => l.id), workerId }));
        await Promise.allSettled(lines.map((line) => processLine(line)));
      }
    } catch (err) {
      console.error("[scheduler] falha ao reivindicar linhas devidas:", err);
    } finally {
      ticking = false;
      console.log(JSON.stringify({ evento: "cron_tick_fim", duracaoMs: Date.now() - startedAt, workerId }));
    }
  }

  console.log(
    JSON.stringify({ evento: "scheduler_modo", modo: "cron_postgres", intervaloMs: SCHEDULER_INTERVAL_MS, concorrencia: WORKER_CONCURRENCY, workerId })
  );

  inFlight = tick();
  const timer = setInterval(() => {
    if (stopped) return;
    inFlight = tick();
  }, SCHEDULER_INTERVAL_MS);

  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await inFlight;
    },
  };
}
