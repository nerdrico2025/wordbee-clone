import { prisma } from "@wordbee/db";
import { closeProductionLineQueue, recordHeartbeat } from "@wordbee/shared";
import { createRedisConnection } from "./redis.js";
import { startProductionLineWorker, syncActiveLines, startHeartbeatLog } from "./production-line-worker.js";

// Era 30s (SET no Redis a cada 30s = ~86 mil comandos/mês, só disso, 24/7).
// A chave expira em 90s (HEARTBEAT_TTL_SECONDS em worker-health.ts) — com
// 60s de intervalo ainda sobra margem de 1.5x antes do badge do Dashboard
// mostrar "offline" por engano, e o pior caso de detecção de queda real do
// worker só piora de ~120s para ~150s (90s de TTL + até 1 intervalo perdido),
// diferença irrelevante pra uma app de usuário único. Ver DECISIONS.md
// "redução de comandos Redis" (2026-08-29).
const HEARTBEAT_INTERVAL_MS = Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS ?? "60000");

async function main() {
  const redis = createRedisConnection();

  await redis.ping();
  console.log("[worker] Redis conectado.");

  await prisma.$queryRaw`SELECT 1`;
  console.log("[worker] Postgres conectado.");

  await recordHeartbeat(redis);
  const heartbeatTimer = setInterval(() => {
    recordHeartbeat(redis).catch((err) => console.error("[worker] falha ao gravar heartbeat:", err));
  }, HEARTBEAT_INTERVAL_MS);

  await syncActiveLines();

  const bullWorker = startProductionLineWorker(redis);
  console.log("[worker] Processador de Linhas de Produção pronto.");

  const logHeartbeatTimer = startHeartbeatLog();

  const shutdown = async () => {
    console.log("[worker] Encerrando...");
    clearInterval(heartbeatTimer);
    clearInterval(logHeartbeatTimer);
    await bullWorker.close();
    await closeProductionLineQueue();
    await redis.quit();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("[worker] Falha ao iniciar:", error);
  process.exit(1);
});
