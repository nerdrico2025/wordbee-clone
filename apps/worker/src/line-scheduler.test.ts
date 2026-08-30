import { describe, it, expect, vi, beforeEach } from "vitest";

// Precisa ser setado antes do import de "./line-scheduler.js" — o intervalo
// é lido do env uma vez, na carga do módulo. 50ms deixa os testes rápidos
// sem precisar de fake timers (mesmo estilo de "tempo real com espera
// curta" já usado em provider-concurrency.test.ts).
process.env.SCHEDULER_INTERVAL_MS = "50";

const claimDueLines = vi.fn();
const releaseLine = vi.fn(async () => undefined);
vi.mock("./postgres-line-lock.js", () => ({ claimDueLines, releaseLine }));

type LogFn = (log: { event: string; detail?: string }) => void;
const runProductionLine = vi.fn(async (_redis: unknown, _lineId: string, _log: LogFn) => undefined);
vi.mock("./line-pipeline.js", () => ({ runProductionLine }));

const recordLastSuccess = vi.fn(async () => undefined);
vi.mock("@wordbee/shared", () => ({ recordLastSuccess }));

const { startLineScheduler } = await import("./line-scheduler.js");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(() => {
  vi.clearAllMocks();
  claimDueLines.mockResolvedValue([]);
  releaseLine.mockResolvedValue(undefined);
  runProductionLine.mockResolvedValue(undefined);
  recordLastSuccess.mockResolvedValue(undefined);
});

describe("startLineScheduler — overlap de ticks", () => {
  it("nunca sobrepõe: um novo tick não começa enquanto o anterior ainda está reivindicando/processando", async () => {
    let resolveFirstClaim!: (lines: unknown[]) => void;
    claimDueLines.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirstClaim = resolve; })
    );

    const scheduler = startLineScheduler({} as never, "worker-1");
    try {
      // O primeiro tick roda imediatamente no boot e fica "pendurado" (a
      // promise de claimDueLines nunca resolveu ainda). Mais de 2 intervalos
      // de 50ms se passam — se houvesse sobreposição, claimDueLines teria
      // sido chamado de novo nesse meio tempo.
      await sleep(140);
      expect(claimDueLines).toHaveBeenCalledTimes(1);

      resolveFirstClaim([]);
      await sleep(140);
      expect(claimDueLines.mock.calls.length).toBeGreaterThan(1);
    } finally {
      await scheduler.stop();
    }
  });

  it("stop() interrompe novos ticks", async () => {
    const scheduler = startLineScheduler({} as never, "worker-1");
    await sleep(70);
    await scheduler.stop();

    const callsAtStop = claimDueLines.mock.calls.length;
    await sleep(140);
    expect(claimDueLines.mock.calls.length).toBe(callsAtStop);
  });
});

describe("startLineScheduler — processamento das linhas reivindicadas", () => {
  it("processa em paralelo, isola erro de uma linha das demais e libera o lock de todas", async () => {
    claimDueLines.mockResolvedValueOnce([{ id: "line-ok" }, { id: "line-erro" }]).mockResolvedValue([]);
    runProductionLine.mockImplementation(async (_redis: unknown, lineId: string, log: (l: { event: string; detail?: string }) => void) => {
      if (lineId === "line-erro") throw new Error("crash inesperado — não deveria acontecer, mas o scheduler precisa sobreviver");
      log({ event: "publicado", detail: "https://blog.test/post" });
    });

    const scheduler = startLineScheduler({} as never, "worker-1");
    try {
      await sleep(120);

      expect(runProductionLine).toHaveBeenCalledWith(expect.anything(), "line-ok", expect.any(Function));
      expect(runProductionLine).toHaveBeenCalledWith(expect.anything(), "line-erro", expect.any(Function));
      expect(releaseLine).toHaveBeenCalledWith("line-ok");
      expect(releaseLine).toHaveBeenCalledWith("line-erro");
      expect(recordLastSuccess).toHaveBeenCalled();
    } finally {
      await scheduler.stop();
    }
  });

  it("libera o lock mesmo quando não há evento 'publicado' (linha falhou ou foi adiada)", async () => {
    claimDueLines.mockResolvedValueOnce([{ id: "line-1" }]).mockResolvedValue([]);
    runProductionLine.mockImplementation(async (_redis: unknown, _lineId: string, log: (l: { event: string; detail?: string }) => void) => {
      log({ event: "falha_tentativa_1" });
    });

    const scheduler = startLineScheduler({} as never, "worker-1");
    try {
      await sleep(100);
      expect(releaseLine).toHaveBeenCalledWith("line-1");
      expect(recordLastSuccess).not.toHaveBeenCalled();
    } finally {
      await scheduler.stop();
    }
  });
});
