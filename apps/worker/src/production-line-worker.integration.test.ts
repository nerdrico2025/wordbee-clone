/**
 * Teste de integração com BullMQ + Redis REAIS (não mocka scheduleLineRun
 * nem a fila). Existe especificamente para pegar a classe de bug descrita
 * em DECISIONS.md: scheduleLineRun(lineId, ...) usa jobId = lineId, e o
 * BullMQ ignora silenciosamente um add() com jobId já existente na fila em
 * qualquer estado (https://docs.bullmq.io/guide/jobs/job-ids). Chamar
 * scheduleLineRun de dentro do processor — enquanto o job atual ainda está
 * "active" com esse mesmo jobId — faz o reagendamento falhar sem erro
 * nenhum. Os testes unitários de line-pipeline.test.ts mockam scheduleLineRun
 * inteiro, então nunca exercitam essa colisão real do BullMQ.
 *
 * Sobe um `redis-server` efêmero em processo filho (localhost, porta livre,
 * sem persistência) em vez de usar ioredis-mock: o BullMQ depende de scripts
 * Lua e de semântica de fila que mocks em memória não reproduzem com
 * fidelidade suficiente para um teste de regressão deste bug. Se o binário
 * `redis-server` não estiver disponível no ambiente, o teste é pulado.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync, spawn, type ChildProcessByStdio } from "node:child_process";
import net from "node:net";
import type { Readable } from "node:stream";
import type { Queue } from "bullmq";

function hasRedisServerBinary(): boolean {
  try {
    execSync("which redis-server", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const REDIS_AVAILABLE = hasRedisServerBinary();

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, () => {
      const address = srv.address();
      if (address && typeof address === "object") {
        const port = address.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("não foi possível obter uma porta livre")));
      }
    });
  });
}

function waitForRedisReady(proc: ChildProcessByStdio<null, Readable, Readable>): Promise<void> {
  return new Promise((resolve, reject) => {
    let out = "";
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("timeout esperando redis-server iniciar"));
    }, 10_000);

    const onData = (chunk: Buffer) => {
      out += chunk.toString();
      if (out.includes("Ready to accept connections")) {
        cleanup();
        resolve();
      }
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const onExit = (code: number | null) => {
      if (code !== null && code !== 0) {
        cleanup();
        reject(new Error(`redis-server saiu com código ${code}`));
      }
    };

    function cleanup() {
      clearTimeout(timeout);
      proc.stdout.off("data", onData);
      proc.off("error", onError);
      proc.off("exit", onExit);
    }

    proc.stdout.on("data", onData);
    proc.on("error", onError);
    proc.on("exit", onExit);
  });
}

// Mocka só a lógica de negócio e o acesso a dados — a fila/BullMQ/Redis são reais.
const runProductionLine = vi.fn(async () => undefined);
vi.mock("./line-pipeline.js", () => ({ runProductionLine }));

interface FakeLine {
  id: string;
  nome: string;
  nextRunAt: Date | null;
}

const findUnique = vi.fn();
const findMany = vi.fn(async (): Promise<FakeLine[]> => []);
vi.mock("@wordbee/db", () => ({ prisma: { productionLine: { findUnique, findMany } } }));

const acquireLineLock = vi.fn(async () => true);
const releaseLineLock = vi.fn(async () => undefined);
vi.mock("./lock.js", () => ({ acquireLineLock, releaseLineLock }));

async function waitForJobState(queue: Queue, jobId: string, expectedState: string | string[], timeoutMs = 5000) {
  const expected = Array.isArray(expectedState) ? expectedState : [expectedState];
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = await queue.getJob(jobId);
    if (job) {
      const state = await job.getState();
      if (expected.includes(state)) return job;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timeout esperando job "${jobId}" entrar em algum destes estados: ${expected.join(", ")}`);
}

describe.skipIf(!REDIS_AVAILABLE)("production-line-worker — reagendamento real via BullMQ (Redis real)", () => {
  let redisProcess: ChildProcessByStdio<null, Readable, Readable>;
  let port: number;

  beforeAll(async () => {
    port = await findFreePort();
    redisProcess = spawn("redis-server", ["--port", String(port), "--save", "", "--appendonly", "no"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    await waitForRedisReady(redisProcess);
    process.env.REDIS_URL = `redis://127.0.0.1:${port}`;
  }, 20_000);

  afterAll(async () => {
    const { closeProductionLineQueue } = await import("@wordbee/shared");
    await closeProductionLineQueue();
    redisProcess?.kill();
  });

  it("agenda a próxima execução (jobId = lineId) só depois que o job atual sai da fila, sem colisão", async () => {
    const { Redis } = await import("ioredis");
    const { startProductionLineWorker } = await import("./production-line-worker.js");
    const { getProductionLineQueue, scheduleLineRun } = await import("@wordbee/shared");

    const lineId = `line-integration-${Date.now()}`;
    const nextRunAt = new Date(Date.now() + 60_000);
    findUnique.mockResolvedValue({ id: lineId, status: "ATIVA", nextRunAt });

    const connection = new Redis(`redis://127.0.0.1:${port}`, { maxRetriesPerRequest: null });
    const worker = startProductionLineWorker(connection);

    try {
      // Agenda a execução inicial da linha — mesmo jobId que seria reusado
      // por um scheduleLineRun chamado (erroneamente) de dentro do processor.
      await scheduleLineRun(lineId, 0);

      await new Promise<void>((resolve, reject) => {
        const onCompleted = () => {
          worker.off("failed", onFailed);
          resolve();
        };
        const onFailed = (_job: unknown, err: Error) => {
          worker.off("completed", onCompleted);
          reject(err);
        };
        worker.once("completed", onCompleted);
        worker.once("failed", onFailed);
        setTimeout(() => reject(new Error("timeout esperando o job completar")), 10_000);
      });

      expect(runProductionLine).toHaveBeenCalledWith(expect.anything(), lineId, expect.any(Function));

      // O reagendamento roda no handler "completed" (assíncrono, depois do
      // evento acima); espera até o novo job delayed aparecer na fila.
      const queue = getProductionLineQueue();
      const job = await waitForJobState(queue, lineId, "delayed");
      expect(job.data.lineId).toBe(lineId);
      expect(job.id).toBe(lineId);
    } finally {
      await worker.close();
      await connection.quit();
    }
  }, 20_000);

  it("não reagenda quando a linha foi pausada durante a execução do job", async () => {
    const { Redis } = await import("ioredis");
    const { startProductionLineWorker } = await import("./production-line-worker.js");
    const { getProductionLineQueue, scheduleLineRun } = await import("@wordbee/shared");

    const lineId = `line-integration-paused-${Date.now()}`;
    findUnique.mockResolvedValue({ id: lineId, status: "PAUSADA", nextRunAt: null });

    const connection = new Redis(`redis://127.0.0.1:${port}`, { maxRetriesPerRequest: null });
    const worker = startProductionLineWorker(connection);

    try {
      await scheduleLineRun(lineId, 0);

      await new Promise<void>((resolve, reject) => {
        worker.once("completed", () => resolve());
        worker.once("failed", (_job, err) => reject(err));
        setTimeout(() => reject(new Error("timeout esperando o job completar")), 10_000);
      });

      // Dá tempo do handler "completed" rodar (e confirmar que ele NÃO
      // recria o job) antes de checar o estado final da fila.
      await new Promise((r) => setTimeout(r, 300));

      const queue = getProductionLineQueue();
      const job = await queue.getJob(lineId);
      expect(job).toBeFalsy();
    } finally {
      await worker.close();
      await connection.quit();
    }
  }, 20_000);

  it("job que lança uma exceção real (fora do try/catch de negócio) ainda fica reagendável depois — o handler 'failed' remove o job morto antes de recriar", async () => {
    const { Redis } = await import("ioredis");
    const { startProductionLineWorker } = await import("./production-line-worker.js");
    const { getProductionLineQueue, scheduleLineRun } = await import("@wordbee/shared");

    const lineId = `line-integration-crash-${Date.now()}`;
    const nextRunAt = new Date(Date.now() + 60_000);
    findUnique.mockResolvedValue({ id: lineId, status: "ATIVA", nextRunAt });
    // Simula exatamente o cenário do bug: uma exceção de verdade escapando
    // do processor (ex.: getDecryptedApiKey/getSiteCredentials falhando de
    // um jeito que a rede de segurança de line-pipeline.ts não pegasse).
    // Sem retry configurado (attempts padrão = 1), o job vai direto pra
    // "failed" — exatamente o job morto que ocupava o jobId=lineId antes
    // do fix de cancelLineRun.
    runProductionLine.mockRejectedValueOnce(new Error("crash de verdade, fora do try/catch de negócio"));

    const connection = new Redis(`redis://127.0.0.1:${port}`, { maxRetriesPerRequest: null });
    const worker = startProductionLineWorker(connection);

    try {
      await scheduleLineRun(lineId, 0);

      await new Promise<void>((resolve, reject) => {
        worker.once("failed", () => resolve());
        worker.once("completed", () => reject(new Error("job não deveria completar — o mock rejeitou de propósito")));
        setTimeout(() => reject(new Error("timeout esperando o job falhar")), 10_000);
      });

      // O reagendamento do handler "failed" é assíncrono; espera até o job
      // morto ser removido e um novo job "delayed" tomar seu lugar. Sem o
      // fix de cancelLineRun (que antes só removia waiting/delayed), essa
      // espera daria timeout — o job "failed" ficaria ocupando o jobId pra
      // sempre.
      const queue = getProductionLineQueue();
      const job = await waitForJobState(queue, lineId, "delayed");
      expect(job.data.lineId).toBe(lineId);
      expect(job.id).toBe(lineId);
    } finally {
      await worker.close();
      await connection.quit();
    }
  }, 20_000);

  it("syncActiveLines recupera uma linha cujo job ficou preso em estado 'failed' morto (sem depender do handler 'failed' do worker de produção)", async () => {
    const { Redis } = await import("ioredis");
    const { Worker } = await import("bullmq");
    const { scheduleLineRun, getProductionLineQueue, PRODUCTION_LINE_QUEUE_NAME } = await import("@wordbee/shared");
    const { syncActiveLines } = await import("./production-line-worker.js");

    const lineId = `line-integration-deadfailed-${Date.now()}`;
    // nextRunAt no passado — reproduz literalmente o sintoma relatado
    // (linha "Ativa" com hora de próxima execução já vencida).
    const nextRunAt = new Date(Date.now() - 5 * 60_000);
    findMany.mockResolvedValue([{ id: lineId, nome: "Linha travada", nextRunAt }]);

    const connection = new Redis(`redis://127.0.0.1:${port}`, { maxRetriesPerRequest: null });

    // Worker "cru", sem os handlers completed/failed de production-line-worker.ts:
    // deixa o job propositalmente preso em "failed" pra testar a recuperação
    // de syncActiveLines de forma isolada, sem depender do outro handler.
    const crashingWorker = new Worker(
      PRODUCTION_LINE_QUEUE_NAME,
      async () => {
        throw new Error("crash simulado, sem nenhum handler de recuperação registrado");
      },
      { connection }
    );

    try {
      await scheduleLineRun(lineId, 0);

      await new Promise<void>((resolve, reject) => {
        crashingWorker.once("failed", () => resolve());
        crashingWorker.once("completed", () => reject(new Error("não deveria completar — o processor sempre lança")));
        setTimeout(() => reject(new Error("timeout esperando o job falhar")), 10_000);
      });
      await crashingWorker.close();

      const queue = getProductionLineQueue();
      const stuckJob = await queue.getJob(lineId);
      expect(stuckJob).toBeTruthy();
      expect(await stuckJob!.getState()).toBe("failed"); // confirma o cenário: job morto ocupando o jobId

      await syncActiveLines();

      // nextRunAt está no passado, então o novo job pode entrar como
      // "waiting" (delay 0) ou "delayed" (corrida de alguns ms) — o que
      // importa é que ele existe de novo e não é mais o job morto.
      const recovered = await waitForJobState(queue, lineId, ["waiting", "delayed"]);
      expect(recovered.data.lineId).toBe(lineId);
    } finally {
      await crashingWorker.close().catch(() => undefined);
      await connection.quit();
    }
  }, 20_000);
});
