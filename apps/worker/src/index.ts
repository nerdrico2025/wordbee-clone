import { prisma } from "@wordbee/db";
import { createRedisConnection } from "./redis.js";

/**
 * Placeholder do worker BullMQ. A fila/agendador de Linhas de Produção
 * (repeatable jobs, lock por linha, concorrência por provedor de IA) é
 * implementada no PROMPT 3 do PRD. Por enquanto, este processo apenas
 * valida a conectividade com Postgres e Redis ao subir, para que o
 * scaffold do monorepo já rode ponta a ponta.
 */
async function main() {
  const redis = createRedisConnection();

  await redis.ping();
  console.log("[worker] Redis conectado.");

  await prisma.$queryRaw`SELECT 1`;
  console.log("[worker] Postgres conectado.");

  console.log("[worker] Pronto. Aguardando implementação da fila (PROMPT 3).");

  const shutdown = async () => {
    console.log("[worker] Encerrando...");
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
