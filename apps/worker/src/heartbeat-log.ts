import { prisma } from "@wordbee/db";
import { snapshotRedisCommandCounts } from "@wordbee/shared";

// 30 min é o suficiente pra notar no stream de log do EasyPanel que o
// processo morreu, sem gerar comandos de fundo desnecessários — mesmo
// raciocínio já aplicado ao heartbeat antigo (ver DECISIONS.md "redução de
// comandos Redis", 2026-08-29).
const HEARTBEAT_LOG_INTERVAL_MS = Number(process.env.WORKER_HEARTBEAT_LOG_INTERVAL_MS ?? String(30 * 60_000));

/**
 * Log periódico de saúde do processo, pensado pra ser lido direto no stream
 * de log do EasyPanel. `comandosRedis` é só leitura de um contador em
 * memória (não gera nenhum comando Redis novo) — com o scheduler cron+
 * Postgres, esse número deve ficar próximo de zero em repouso (sobrando só
 * o semáforo de concorrência por provedor de IA durante execuções reais),
 * bem diferente do que era com o BullMQ always-on. Ver DECISIONS.md
 * "scheduler cron+Postgres".
 */
export function startHeartbeatLog(workerId: string): NodeJS.Timeout {
  const logOnce = async () => {
    try {
      const [linhasAtivas, linhasEmExecucao] = await Promise.all([
        prisma.productionLine.count({ where: { status: "ATIVA" } }),
        prisma.productionLine.count({ where: { lockedAt: { not: null } } }),
      ]);
      console.log(
        JSON.stringify({
          evento: "heartbeat",
          workerId,
          pid: process.pid,
          timestamp: new Date().toISOString(),
          linhasAtivas,
          linhasEmExecucao,
          comandosRedis: snapshotRedisCommandCounts(),
        })
      );
    } catch (err) {
      console.error("[worker] falha ao gravar heartbeat de log:", err);
    }
  };

  void logOnce();
  return setInterval(logOnce, HEARTBEAT_LOG_INTERVAL_MS);
}
