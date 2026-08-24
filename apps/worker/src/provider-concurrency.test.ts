import { describe, it, expect, vi, beforeEach } from "vitest";
import { withProviderSlot } from "./provider-concurrency.js";

function fakeRedis() {
  let counters: Record<string, number> = {};
  return {
    incr: vi.fn(async (key: string) => {
      counters[key] = (counters[key] ?? 0) + 1;
      return counters[key];
    }),
    decr: vi.fn(async (key: string) => {
      counters[key] = (counters[key] ?? 0) - 1;
      return counters[key];
    }),
    expire: vi.fn(async () => 1),
    __reset: () => {
      counters = {};
    },
  };
}

describe("withProviderSlot", () => {
  beforeEach(() => {
    vi.stubEnv("AI_PROVIDER_CONCURRENCY", "2");
  });

  it("executa a função quando há vaga disponível", async () => {
    const redis = fakeRedis();
    const result = await withProviderSlot(redis as never, "gemini", async () => "ok");
    expect(result).toBe("ok");
  });

  it("libera a vaga mesmo se a função lançar erro", async () => {
    const redis = fakeRedis();
    await expect(withProviderSlot(redis as never, "gemini", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    // a vaga liberada = próxima chamada consegue rodar sem travar
    const result = await withProviderSlot(redis as never, "gemini", async () => "depois-do-erro");
    expect(result).toBe("depois-do-erro");
  });

  it("espera até liberar vaga quando o limite de concorrência é atingido", async () => {
    const redis = fakeRedis();
    let running = 0;
    let maxObserved = 0;

    async function task() {
      running++;
      maxObserved = Math.max(maxObserved, running);
      await new Promise((r) => setTimeout(r, 30));
      running--;
      return "done";
    }

    const results = await Promise.all([
      withProviderSlot(redis as never, "openai", task),
      withProviderSlot(redis as never, "openai", task),
      withProviderSlot(redis as never, "openai", task),
    ]);

    expect(results).toEqual(["done", "done", "done"]);
    expect(maxObserved).toBeLessThanOrEqual(2); // AI_PROVIDER_CONCURRENCY=2
  }, 10_000);
});
