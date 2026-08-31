import type { Redis } from "ioredis";
import {
  claimDuePagePosts,
  claimPendingPackages,
  releasePackage,
  releasePagePost,
} from "./postgres-distribution-lock.js";
import { buildDistributionPackage, enqueueDistributionPackages } from "./distribution-package-builder.js";
import { publishPageDistributionPost } from "./page-distribution-pipeline.js";

/**
 * Scheduler da distribuição — mesmo desenho do `line-scheduler.ts`:
 * `setInterval` + guarda contra sobreposição de tick + reivindicação
 * atômica no Postgres. Nenhuma fila no Redis, pelo mesmo motivo já
 * documentado (o long-poll always-on do BullMQ custava ~260 mil comandos
 * Redis por mês só de ociosidade — ver DECISIONS.md "scheduler
 * cron+Postgres").
 *
 * Cada tick faz três coisas, nesta ordem:
 *   1. varre artigos recém-publicados e enfileira pacotes (barato, sem IA);
 *   2. monta pacotes PENDENTE reivindicados (chamada de IA, sob semáforo);
 *   3. publica nas Páginas as distribuições cujo horário venceu.
 *
 * A ordem importa pouco na prática (cada etapa é independente e
 * idempotente), mas manter enfileirar → montar → publicar faz um artigo
 * publicado agora chegar até a Página no menor número de ticks possível.
 */

const INTERVAL_MS = Number(process.env.DISTRIBUTION_SCHEDULER_INTERVAL_MS ?? String(120_000));
const PACKAGE_CONCURRENCY = Number(process.env.DISTRIBUTION_PACKAGE_CONCURRENCY ?? "3");
const PUBLISH_CONCURRENCY = Number(process.env.DISTRIBUTION_PUBLISH_CONCURRENCY ?? "3");

export interface DistributionScheduler {
  stop(): Promise<void>;
}

export function startDistributionScheduler(redis: Redis, workerId: string): DistributionScheduler {
  let ticking = false;
  let stopped = false;
  let inFlight: Promise<void> = Promise.resolve();

  async function processPackage(packageId: string): Promise<void> {
    try {
      await buildDistributionPackage(redis, packageId, ({ event, detail }) => {
        console.log(JSON.stringify({ evento: event, pacote: packageId, detalhe: detail, workerId }));
      });
    } catch (err) {
      // Rede de segurança: buildDistributionPackage já não deveria lançar.
      console.error(`[distribuicao] buildDistributionPackage lançou inesperadamente (${packageId}):`, err);
    } finally {
      await releasePackage(packageId).catch((err) =>
        console.error(`[distribuicao] falha ao liberar lock do pacote ${packageId}:`, err)
      );
    }
  }

  async function processPagePost(postId: string): Promise<void> {
    try {
      await publishPageDistributionPost(postId, ({ event, detail }) => {
        console.log(JSON.stringify({ evento: event, distribuicao: postId, detalhe: detail, workerId }));
      });
    } catch (err) {
      console.error(`[distribuicao] publishPageDistributionPost lançou inesperadamente (${postId}):`, err);
    } finally {
      await releasePagePost(postId).catch((err) =>
        console.error(`[distribuicao] falha ao liberar lock da distribuição ${postId}:`, err)
      );
    }
  }

  async function tick(): Promise<void> {
    if (ticking) {
      console.log(JSON.stringify({ evento: "distribuicao_tick_pulado", motivo: "tick_anterior_ainda_em_andamento", workerId }));
      return;
    }
    ticking = true;
    const startedAt = Date.now();
    try {
      // Cada etapa tem seu próprio try/catch: uma falha de infraestrutura
      // ao enfileirar não pode impedir a publicação do que já está pronto.
      try {
        const enfileirados = await enqueueDistributionPackages(({ event, detail, packageId }) =>
          console.log(JSON.stringify({ evento: event, pacote: packageId, detalhe: detail, workerId }))
        );
        if (enfileirados > 0) {
          console.log(JSON.stringify({ evento: "distribuicao_pacotes_enfileirados", quantidade: enfileirados, workerId }));
        }
      } catch (err) {
        console.error("[distribuicao] falha ao enfileirar pacotes:", err);
      }

      try {
        const pacotes = await claimPendingPackages(workerId, PACKAGE_CONCURRENCY);
        if (pacotes.length > 0) {
          console.log(JSON.stringify({ evento: "distribuicao_pacotes_reivindicados", quantidade: pacotes.length, workerId }));
          await Promise.allSettled(pacotes.map((p) => processPackage(p.id)));
        }
      } catch (err) {
        console.error("[distribuicao] falha ao reivindicar pacotes pendentes:", err);
      }

      try {
        const posts = await claimDuePagePosts(workerId, PUBLISH_CONCURRENCY);
        if (posts.length > 0) {
          console.log(JSON.stringify({ evento: "distribuicao_publicacoes_reivindicadas", quantidade: posts.length, workerId }));
          await Promise.allSettled(posts.map((p) => processPagePost(p.id)));
        }
      } catch (err) {
        console.error("[distribuicao] falha ao reivindicar publicações devidas:", err);
      }
    } finally {
      ticking = false;
      console.log(JSON.stringify({ evento: "distribuicao_tick_fim", duracaoMs: Date.now() - startedAt, workerId }));
    }
  }

  console.log(
    JSON.stringify({
      evento: "distribuicao_scheduler_modo",
      modo: "cron_postgres",
      intervaloMs: INTERVAL_MS,
      concorrenciaPacotes: PACKAGE_CONCURRENCY,
      concorrenciaPublicacoes: PUBLISH_CONCURRENCY,
      workerId,
    })
  );

  inFlight = tick();
  const timer = setInterval(() => {
    if (stopped) return;
    inFlight = tick();
  }, INTERVAL_MS);

  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await inFlight;
    },
  };
}
