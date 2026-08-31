import { randomUUID } from "node:crypto";
import { prisma } from "@wordbee/db";
import { recordHeartbeat } from "@wordbee/shared";
import { createRedisConnection } from "./redis.js";
import { startLineScheduler } from "./line-scheduler.js";
import { startDistributionScheduler } from "./distribution-scheduler.js";
import { startHeartbeatLog } from "./heartbeat-log.js";

// Era 30s (SET no Redis a cada 30s = ~86 mil comandos/mês, só disso, 24/7).
// A chave expira em 90s (HEARTBEAT_TTL_SECONDS em worker-health.ts) — com
// 60s de intervalo ainda sobra margem de 1.5x antes do badge do Dashboard
// mostrar "offline" por engano, e o pior caso de detecção de queda real do
// worker só piora de ~120s para ~150s (90s de TTL + até 1 intervalo perdido),
// diferença irrelevante pra uma app de usuário único. Ver DECISIONS.md
// "redução de comandos Redis" (2026-08-29).
const HEARTBEAT_INTERVAL_MS = Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS ?? "60000");

/**
 * Id único por processo, gerado uma vez na carga do módulo e incluído em
 * todo log estruturado do worker (scheduler, heartbeat) — permite detectar
 * duas instâncias rodando ao mesmo tempo (ex.: deploy com múltiplas réplicas
 * sem querer) direto no stream de log do EasyPanel. Ver DECISIONS.md.
 */
const WORKER_INSTANCE_ID = randomUUID();

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

  const scheduler = startLineScheduler(redis, WORKER_INSTANCE_ID);
  console.log("[worker] Scheduler de Linhas de Produção (cron+Postgres) pronto.");

  // Segundo scheduler, independente do primeiro: uma falha na distribuição
  // (Facebook fora do ar, token expirado) nunca pode atrasar a publicação
  // dos artigos, que é a função principal do produto.
  const distributionScheduler = startDistributionScheduler(redis, WORKER_INSTANCE_ID);
  console.log("[worker] Scheduler de Distribuição (Páginas do Facebook) pronto.");

  const logHeartbeatTimer = startHeartbeatLog(WORKER_INSTANCE_ID);

  const shutdown = async () => {
    console.log("[worker] Encerrando...");
    clearInterval(heartbeatTimer);
    clearInterval(logHeartbeatTimer);
    await Promise.all([scheduler.stop(), distributionScheduler.stop()]);
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
