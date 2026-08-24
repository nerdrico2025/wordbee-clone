import { prisma } from "@wordbee/db";
import { closeProductionLineQueue } from "@wordbee/shared";
import { createRedisConnection } from "./redis.js";
import { startProductionLineWorker, syncActiveLines } from "./production-line-worker.js";

async function main() {
  const redis = createRedisConnection();

  await redis.ping();
  console.log("[worker] Redis conectado.");

  await prisma.$queryRaw`SELECT 1`;
  console.log("[worker] Postgres conectado.");

  await syncActiveLines();

  const bullWorker = startProductionLineWorker(redis);
  console.log("[worker] Processador de Linhas de Produção pronto.");

  const shutdown = async () => {
    console.log("[worker] Encerrando...");
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
