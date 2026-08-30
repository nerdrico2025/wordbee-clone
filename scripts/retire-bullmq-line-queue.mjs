#!/usr/bin/env node
// Limpeza pontual de deploy: apaga do Redis todas as chaves que sobraram da
// fila BullMQ "production-line-run" (a antiga forma de agendar Linhas de
// Produção, substituída pelo scheduler cron+Postgres — ver DECISIONS.md
// "scheduler cron+Postgres", 2026-08-30).
//
// Não importa nada de "@wordbee/shared" nem instancia um `Queue` do BullMQ
// de propósito: como o código do scheduler antigo (packages/shared/src/queue)
// já foi removido do repositório, este script fala com o Redis diretamente
// via SCAN/UNLINK usando o mesmo prefixo que o BullMQ sempre usou por padrão
// ("bull:<nome-da-fila>:*"). Funciona sozinho, sem depender de nenhum
// pacote além de `ioredis` (já é dependência hoisted do monorepo).
//
// Idempotente por natureza: se rodar de novo depois que as chaves já foram
// removidas, o SCAN não encontra nada e o script termina sem fazer nada
// (nenhum erro, nenhuma duplicação). Seguro de rodar mais de uma vez em
// produção, inclusive antes de o deploy do novo worker existir (só apaga
// chaves órfãs da fila antiga; não toca em nada relacionado ao semáforo de
// concorrência por provedor de IA — chaves "provider-slot:*" — nem no
// heartbeat do worker — chaves "worker:*").
//
// Uso:
//   REDIS_URL="rediss://..." node scripts/retire-bullmq-line-queue.mjs
// ou, usando o .env do projeto:
//   npx dotenv -e .env -- node scripts/retire-bullmq-line-queue.mjs
import { Redis } from "ioredis";

const QUEUE_PREFIX = "bull:production-line-run:";
const SCAN_COUNT = 200;

export async function retireBullmqLineQueue(redis) {
  let cursor = "0";
  let deleted = 0;

  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", `${QUEUE_PREFIX}*`, "COUNT", SCAN_COUNT);
    cursor = nextCursor;
    if (keys.length > 0) {
      await redis.unlink(...keys);
      deleted += keys.length;
    }
  } while (cursor !== "0");

  return deleted;
}

async function main() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.error("REDIS_URL não configurada.");
    process.exit(1);
  }

  const redis = new Redis(url, { maxRetriesPerRequest: null });
  try {
    const deleted = await retireBullmqLineQueue(redis);
    console.log(JSON.stringify({ evento: "retire_bullmq_line_queue_concluido", chavesRemovidas: deleted }));
  } finally {
    await redis.quit();
  }
}

// Só roda main() quando executado diretamente (node scripts/...), não
// quando importado pelo teste.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("[retire-bullmq-line-queue] falha:", err);
    process.exit(1);
  });
}
