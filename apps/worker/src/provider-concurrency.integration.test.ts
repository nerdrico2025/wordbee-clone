/**
 * Teste de integração com Redis REAL (não mocado) para o semáforo de
 * concorrência por provedor de IA (`provider-slot:<provider>`). Existe
 * especificamente para cobrir a classe de bug que um mock em JS não pega:
 * o comportamento real do Redis quando uma chave expira por TTL enquanto
 * ainda está "devida" (`DECR` numa chave inexistente cria a chave do zero
 * em -1, sem TTL) — foi exatamente esse mecanismo que já causou um bug real
 * em produção em 2026-08-29 (`GET provider-slot:openrouter` retornou -2,
 * `TTL -1`, permanente; ver DECISIONS.md).
 *
 * A auditoria de 2026-08-31 (PROJECT-STATE.md) encontrou que a correção de
 * 2026-08-29 só tornou a AQUISIÇÃO atômica (script Lua) — a LIBERAÇÃO
 * continuava sendo um `redis.decr(key)` puro, reabrindo exatamente o mesmo
 * modo de falha. Este arquivo reproduz o bug against Redis de verdade antes
 * da correção, e prova a correção depois.
 *
 * Sobe um `redis-server` efêmero em processo filho — mesmo padrão usado em
 * `scripts/retire-bullmq-line-queue.test.mjs`.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { execSync, spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Redis } from "ioredis";
import { withProviderSlot, acquireProviderSlot, releaseProviderSlot, providerSlotKey } from "./provider-concurrency.js";

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

    const cleanup = () => {
      clearTimeout(timeout);
      proc.stdout.off("data", onData);
      proc.off("error", onError);
      proc.off("exit", onExit);
    };

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

    proc.stdout.on("data", onData);
    proc.on("error", onError);
    proc.on("exit", onExit);
  });
}

describe.skipIf(!REDIS_AVAILABLE)("provider-concurrency — semáforo por provedor de IA (Redis real)", () => {
  let redisProcess: ChildProcessByStdio<null, Readable, Readable>;
  let redis: Redis;
  let port: number;
  let dataDir: string;

  beforeAll(async () => {
    port = await findFreePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "wordbee-providerslot-test-"));
    redisProcess = spawn("redis-server", ["--port", String(port), "--dir", dataDir, "--save", "", "--appendonly", "no"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    await waitForRedisReady(redisProcess);
    redis = new Redis(`redis://127.0.0.1:${port}`, { maxRetriesPerRequest: null });
  }, 20_000);

  afterAll(async () => {
    await redis?.quit();
    redisProcess?.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await redis.flushall();
  });

  it("acquire + release normal: contador volta a 0 e a chave mantém um TTL válido (nenhum resíduo)", async () => {
    const key = providerSlotKey("gemini");
    const acquired = await acquireProviderSlot(redis, "gemini");
    expect(acquired).toBe(true);
    expect(await redis.get(key)).toBe("1");

    await releaseProviderSlot(redis, "gemini");

    expect(await redis.get(key)).toBe("0");
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
  });

  it("BUG REAL (2026-08-29): se a chave expira por TTL enquanto o slot ainda está em uso, a liberação não pode deixar o contador negativo nem sem TTL", async () => {
    const key = providerSlotKey("openrouter");

    await withProviderSlot(redis, "openrouter", async () => {
      // Simula o TTL do slot expirando enquanto a chamada de IA ainda está
      // em andamento (ex.: geração de artigo longa via streaming, perto do
      // teto de 5min) — no Redis real isso é o próprio TTL zerando a chave
      // sozinho; aqui simulamos deletando a chave diretamente, que é
      // exatamente o estado "chave não existe mais" que o Redis produziria.
      await redis.del(key);
    });

    const value = await redis.get(key);
    const ttl = await redis.ttl(key);

    // Antes da correção: DECR puro numa chave ausente recria a chave do
    // zero em -1, SEM TTL (ttl === -1, "persistente pra sempre") — o exato
    // estado encontrado ao vivo em produção. Depois da correção: a
    // liberação nunca deixa o contador negativo (clamp em 0) e SEMPRE
        // renova o TTL, mesmo partindo de uma chave já expirada/ausente.
    expect(Number(value)).toBeGreaterThanOrEqual(0);
    expect(ttl).toBeGreaterThan(0);
  });

  it("liberações duplicadas/concorrentes no mesmo slot nunca deixam o contador negativo", async () => {
    const key = providerSlotKey("stability");
    await acquireProviderSlot(redis, "stability");

    // Duas liberações para uma única aquisição (ex.: bug futuro chamando
    // release duas vezes, ou duas instâncias do worker liberando o mesmo
    // slot por engano) não podem deixar resíduo negativo.
    await releaseProviderSlot(redis, "stability");
    await releaseProviderSlot(redis, "stability");

    const value = await redis.get(key);
    const ttl = await redis.ttl(key);
    expect(Number(value)).toBeGreaterThanOrEqual(0);
    expect(ttl).toBeGreaterThan(0);
  });

  it("liberação no caminho de erro (exceção durante o job) também é atômica e mantém TTL", async () => {
    const key = providerSlotKey("grok");

    await expect(
      withProviderSlot(redis, "grok", async () => {
        throw new Error("falha simulada durante a chamada de IA");
      })
    ).rejects.toThrow("falha simulada durante a chamada de IA");

    const value = await redis.get(key);
    const ttl = await redis.ttl(key);
    expect(Number(value)).toBeGreaterThanOrEqual(0);
    expect(ttl).toBeGreaterThan(0);
  });

  it("respeita o limite de concorrência configurado (AI_PROVIDER_CONCURRENCY) mesmo com a liberação atômica nova", async () => {
    const originalEnv = process.env.AI_PROVIDER_CONCURRENCY;
    process.env.AI_PROVIDER_CONCURRENCY = "2";
    try {
      let running = 0;
      let maxObserved = 0;
      const task = async () => {
        running++;
        maxObserved = Math.max(maxObserved, running);
        await new Promise((r) => setTimeout(r, 50));
        running--;
        return "done";
      };

      const results = await Promise.all([
        withProviderSlot(redis, "openai", task),
        withProviderSlot(redis, "openai", task),
        withProviderSlot(redis, "openai", task),
      ]);

      expect(results).toEqual(["done", "done", "done"]);
      expect(maxObserved).toBeLessThanOrEqual(2);
      expect(await redis.get(providerSlotKey("openai"))).toBe("0");
    } finally {
      if (originalEnv === undefined) delete process.env.AI_PROVIDER_CONCURRENCY;
      else process.env.AI_PROVIDER_CONCURRENCY = originalEnv;
    }
  }, 10_000);
});
