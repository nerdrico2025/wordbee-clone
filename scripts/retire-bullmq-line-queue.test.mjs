// Teste de "migração": confirma que rodar o script de limpeza da fila
// BullMQ antiga duas vezes seguidas é seguro — a segunda vez não encontra
// nada para remover e não lança. Usa um `redis-server` real efêmero, não um
// mock, porque o que importa aqui é o comportamento real de SCAN/UNLINK
// contra chaves de verdade.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { execSync, spawn } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Redis } from "ioredis";
import { retireBullmqLineQueue } from "./retire-bullmq-line-queue.mjs";

function hasRedisServerBinary() {
  try {
    execSync("which redis-server", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const REDIS_AVAILABLE = hasRedisServerBinary();

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function waitForRedisReady(proc) {
  return new Promise((resolve, reject) => {
    let out = "";
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("timeout esperando redis-server iniciar"));
    }, 10_000);

    const onData = (chunk) => {
      out += chunk.toString();
      if (out.includes("Ready to accept connections")) {
        cleanup();
        resolve();
      }
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const onExit = (code) => {
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

describe.skipIf(!REDIS_AVAILABLE)("retireBullmqLineQueue — limpeza idempotente da fila BullMQ antiga (Redis real)", () => {
  let redisProcess;
  let redis;
  let port;
  let dataDir;

  beforeAll(async () => {
    port = await findFreePort();
    // `--dir` isolado é essencial: sem isso, o redis-server efêmero herda o
    // `cwd` do processo (raiz do repo) e CARREGA o `dump.rdb` que sobra por
    // lá de sessões de Redis local anteriores — inclusive chaves reais e
    // antigas de "bull:production-line-run:*" de quando a fila BullMQ ainda
    // existia. Isso poluiu silenciosamente uma primeira versão deste teste
    // (contagem de chaves removidas vinha maior que o esperado). `dump.rdb`
    // é local/gitignored, mas o teste não pode depender do estado do
    // diretório de quem o executa.
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "wordbee-redistest-"));
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

  it("remove todas as chaves da fila antiga e preserva chaves de outros mecanismos (semáforo de IA, heartbeat)", async () => {
    await redis.set("bull:production-line-run:meta", "x");
    await redis.set("bull:production-line-run:id:line-1", "x");
    await redis.lpush("bull:production-line-run:wait", "line-1");
    await redis.set("provider-slot:gemini", "1");
    await redis.set("worker:heartbeat", "123");

    const deleted = await retireBullmqLineQueue(redis);
    expect(deleted).toBe(3);

    const remainingQueueKeys = await redis.keys("bull:production-line-run:*");
    expect(remainingQueueKeys).toEqual([]);
    expect(await redis.get("provider-slot:gemini")).toBe("1");
    expect(await redis.get("worker:heartbeat")).toBe("123");
  });

  it("rodar duas vezes seguidas é seguro — a segunda vez não encontra nada e não lança", async () => {
    await redis.set("bull:production-line-run:id:line-2", "x");

    const firstRun = await retireBullmqLineQueue(redis);
    expect(firstRun).toBeGreaterThan(0);

    await expect(retireBullmqLineQueue(redis)).resolves.toBe(0);

    const remainingQueueKeys = await redis.keys("bull:production-line-run:*");
    expect(remainingQueueKeys).toEqual([]);
  });
});
