import path from "node:path";
import type { Redis } from "ioredis";
import { prisma } from "@wordbee/db";
import type { AiProviderName, ArticleTypeSlug } from "@wordbee/shared";
import {
  createTextProvider,
  createImageProvider,
  uploadMedia,
  createPost,
  getStorageDriver,
  AiProviderError,
  WordPressError,
  IMAGE_PROVIDERS,
} from "@wordbee/shared";
import { getDecryptedApiKey } from "./api-keys.js";
import { getSiteCredentials } from "./wp-sites.js";
import { withProviderSlot } from "./provider-concurrency.js";
import { jitteredMs } from "./jitter.js";

const MAX_ATTEMPTS = 3;
const CONSECUTIVE_FAILURES_TO_PAUSE = 5;
const RATE_LIMIT_DEFER_MS = 15 * 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickRandomTema(temas: string[]): string {
  return temas[Math.floor(Math.random() * temas.length)]!;
}

// ±10% de jitter aleatório sobre o intervalo da linha — evita que várias
// linhas com o mesmo intervaloMin (ex.: criadas juntas, todas de 60min)
// convirjam pra sempre disparar no mesmo minuto ao longo do tempo, gerando
// rajadas simultâneas de chamadas de IA. Só se aplica aos pontos em que o
// PRÓXIMO ciclo é calculado a partir de intervaloMin — nunca na primeira
// execução (delay 0 na criação da linha, calculado em apps/web, que nunca
// passa por aqui) nem no defer de rate limit (RATE_LIMIT_DEFER_MS é fixo).
// O cálculo em si vive em `jitter.ts` desde que a distribuição para Páginas
// do Facebook passou a precisar do mesmo comportamento. Ver DECISIONS.md.
function jitteredIntervalMs(intervaloMin: number): number {
  return jitteredMs(intervaloMin * 60_000);
}

function buildImagePrompt(titulo: string, tema: string): string {
  return `Imagem destacada para um artigo de blog em português sobre "${titulo}" (tema: ${tema}). Fotografia realista, boa iluminação, alta qualidade, sem texto ou letras sobrepostas na imagem.`;
}

function toUserMessage(err: unknown): string {
  if (err instanceof AiProviderError) return err.userMessage;
  if (err instanceof WordPressError) return err.userMessage;
  if (err instanceof Error) return err.message;
  return "Erro inesperado ao gerar o artigo.";
}

function isRateLimit(err: unknown): boolean {
  return err instanceof AiProviderError && (err.code === "rate_limit" || err.code === "unavailable");
}

// Antes, este carregamento só rodava para `iaImagem === "GEMINI"` — um
// resquício de quando Gemini era o único provedor de imagem com suporte a
// imagens de referência. O cliente OpenRouter passou a suportar
// `referenceImages` de verdade (packages/shared/src/ai/openrouter.ts,
// `input_references`) sem que esta checagem fosse atualizada — como
// OpenRouter é hoje o provedor efetivamente em uso em produção, as imagens
// de referência cadastradas em qualquer linha ficavam salvas no storage e
// cadastradas no banco, mas nunca eram lidas nem enviadas ao provedor
// (falha silenciosa, achado na auditoria de PROJECT-STATE.md). Corrigido
// para depender da CAPACIDADE declarada no registry (a mesma fonte que já
// alimenta a UI, `suportaImagensReferencia`), não de um nome de provedor
// hardcoded — qualquer provedor futuro que declare suporte passa a
// funcionar automaticamente, sem precisar tocar aqui de novo.
function providerSupportsReferenceImages(iaImagem: string): boolean {
  return IMAGE_PROVIDERS.some((p) => p.provider === iaImagem && p.suportaImagensReferencia === true);
}

export interface LineRunLog {
  lineId: string;
  event: string;
  detail?: string;
}

export type LogFn = (log: LineRunLog) => void;

/**
 * Executa um "tick" de uma linha de produção: consome/gera título, gera
 * conteúdo+imagem, publica no WordPress e atualiza contadores/nextRunAt.
 * Nunca lança — todo erro é tratado e registrado internamente.
 *
 * Importante: esta função só escreve o próximo `nextRunAt` como parte da
 * mesma escrita de conclusão (sucesso, falha determinística, rate limit ou
 * máximo atingido) — nunca separadamente, e nunca via um mecanismo externo
 * de agendamento. Quem chama esta função (`line-scheduler.ts`) só libera o
 * lock de execução da linha (`releaseLine`, em `postgres-line-lock.ts`) *depois*
 * que ela retorna, garantindo que o reagendamento sempre é visível antes da
 * linha voltar a ficar reivindicável. Ver DECISIONS.md "scheduler
 * cron+Postgres" — este é o mesmo requisito que já existia com BullMQ
 * (reagendar só depois que o job "atual" sai da fila), só que aplicado ao
 * lock em Postgres em vez de a um jobId.
 */
export async function runProductionLine(redis: Redis, lineId: string, log: LogFn = () => undefined): Promise<void> {
  try {
    await runProductionLineInner(redis, lineId, log);
  } catch (err) {
    // Rede de segurança final: nada abaixo desta função deveria lançar sem
    // ser tratado, mas se algo inesperado escapar (erro do Postgres,
    // exceção em getDecryptedApiKey/getSiteCredentials, bug futuro), esta
    // função NUNCA pode lançar para quem chamou — `line-scheduler.ts`
    // precisa liberar o lock da linha no `finally` dele independente do que
    // acontecer aqui, e uma exceção não tratada não impediria isso (o
    // `finally` do chamador roda de qualquer forma), mas deixaria a linha
    // sem nenhum registro de falha nem novo `nextRunAt` — travada até o
    // timeout de lock morto reivindicá-la de novo, sem nunca progredir.
    const message = toUserMessage(err);
    console.error(`[line-pipeline] erro inesperado não tratado na linha ${lineId}:`, err);
    log({ lineId, event: "erro_inesperado", detail: message });
    try {
      const line = await prisma.productionLine.findUnique({ where: { id: lineId } });
      if (line && line.status === "ATIVA") {
        await handleDeterministicFailure(lineId, line.consecutiveFailures, message, line.intervaloMin);
      }
    } catch (dbErr) {
      console.error(`[line-pipeline] falha ao registrar erro inesperado da linha ${lineId} no banco:`, dbErr);
    }
  }
}

async function runProductionLineInner(redis: Redis, lineId: string, log: LogFn): Promise<void> {
  const line = await prisma.productionLine.findUnique({ where: { id: lineId } });
  if (!line) {
    log({ lineId, event: "linha_nao_encontrada" });
    return;
  }
  if (line.status !== "ATIVA") {
    log({ lineId, event: "linha_nao_ativa", detail: line.status });
    return;
  }
  if (line.maxArtigos && line.geradosCount >= line.maxArtigos) {
    await prisma.productionLine.update({
      where: { id: lineId },
      data: { status: "CONCLUIDA", pauseReason: "Máximo de artigos atingido." },
    });
    log({ lineId, event: "maximo_atingido_ao_iniciar" });
    return;
  }

  const textKey = await getDecryptedApiKey(line.userId, line.iaTexto as AiProviderName, "TEXTO");
  const imageKey = await getDecryptedApiKey(line.userId, line.iaImagem as AiProviderName, "IMAGEM");
  if (!textKey || !imageKey) {
    await handleDeterministicFailure(line.id, line.consecutiveFailures, "Chave de IA de texto ou imagem não configurada para esta linha.", line.intervaloMin);
    log({ lineId, event: "chave_ausente" });
    return;
  }

  const textProvider = createTextProvider(line.iaTexto as AiProviderName, textKey);
  const imageProvider = createImageProvider(line.iaImagem as AiProviderName, imageKey);

  // 1. Resolve o título: o próximo da fila, ou gera um novo evitando duplicados.
  const titleItem = await prisma.titleQueueItem.findFirst({
    where: { lineId, status: "NA_FILA" },
    orderBy: { previstoPara: "asc" },
  });

  let titulo: string;
  let tema: string;
  if (titleItem) {
    titulo = titleItem.titulo;
    tema = pickRandomTema(line.temas);
  } else {
    tema = pickRandomTema(line.temas);
    const usados = await getUsedTitles(lineId);
    try {
      const sugestoes = await withProviderSlot(redis, line.iaTexto, () =>
        textProvider.generateTitles({ tipo: line.tipoArtigo as ArticleTypeSlug, tema, quantidade: 1, titulosExistentes: usados })
      );
      titulo = sugestoes[0] ?? `${tema} — ${new Date().toLocaleDateString("pt-BR")}`;
    } catch (err) {
      if (isRateLimit(err)) {
        await handleRateLimit(line.id, line.rateLimitBehavior);
        log({ lineId, event: "rate_limit_titulo" });
        return;
      }
      await handleDeterministicFailure(line.id, line.consecutiveFailures, toUserMessage(err), line.intervaloMin);
      log({ lineId, event: "falha_titulo", detail: toUserMessage(err) });
      return;
    }
  }

  const idempotencyKey = titleItem ? `line:${lineId}:title:${titleItem.id}` : `line:${lineId}:adhoc:${Date.now()}`;

  const existingArticle = await prisma.article.findUnique({ where: { idempotencyKey } });
  if (existingArticle && existingArticle.status !== "FALHA") {
    log({ lineId, event: "idempotencia_ja_publicado", detail: existingArticle.id });
    await prisma.productionLine.update({
      where: { id: lineId },
      data: { nextRunAt: new Date(Date.now() + jitteredIntervalMs(line.intervaloMin)) },
    });
    return;
  }

  const article =
    existingArticle ??
    (await prisma.article.create({
      data: {
        userId: line.userId,
        lineId: line.id,
        titleQueueId: titleItem?.id,
        wpSiteId: line.wpSiteId,
        titulo,
        tema,
        tipo: line.tipoArtigo,
        origem: "LINHA",
        status: "PROCESSANDO",
        iaTexto: line.iaTexto,
        iaImagem: line.iaImagem,
        categoriaWpId: line.categoriaWpId ?? undefined,
        wpStatusAlvo: line.statusWp,
        promptCustomizado: line.promptCustomizado,
        idempotencyKey,
      },
    }));

  if (titleItem) {
    await prisma.titleQueueItem.update({ where: { id: titleItem.id }, data: { status: "USADO" } });
  }

  const referenceImages = providerSupportsReferenceImages(line.iaImagem)
    ? await loadReferenceImages(lineId)
    : undefined;

  let lastError: unknown;
  let rateLimited = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const fresh = await prisma.article.findUniqueOrThrow({ where: { id: article.id } });

      let contentHtml = fresh.contentHtml;
      let excerpt = fresh.excerpt;
      let slug = fresh.slug;
      let finalTitulo = fresh.titulo;

      if (!contentHtml) {
        const gerado = await withProviderSlot(redis, line.iaTexto, () =>
          textProvider.generateArticle({
            tipo: line.tipoArtigo as ArticleTypeSlug,
            tema,
            titulo,
            promptCustomizado: line.promptCustomizado ?? undefined,
          })
        );
        contentHtml = gerado.contentHtml;
        excerpt = gerado.excerpt;
        slug = gerado.slug;
        if (gerado.metaTitle && gerado.metaTitle.length > 0 && gerado.metaTitle.length <= 60) finalTitulo = gerado.metaTitle;
        await prisma.article.update({ where: { id: article.id }, data: { titulo: finalTitulo, contentHtml, excerpt, slug } });
      }

      let wpMediaId = fresh.wpMediaId;
      if (!wpMediaId) {
        const imagem = await withProviderSlot(redis, line.iaImagem, () =>
          imageProvider.generateImage({ prompt: buildImagePrompt(finalTitulo, tema), referenceImages })
        );
        const creds = await getSiteCredentials(line.wpSiteId);
        const ext = imagem.mimeType === "image/jpeg" ? "jpg" : "png";
        const media = await uploadMedia(creds, {
          filename: `${slug || "imagem"}.${ext}`,
          mimeType: imagem.mimeType,
          data: Buffer.from(imagem.base64, "base64"),
        });
        wpMediaId = media.id;
        await prisma.article.update({ where: { id: article.id }, data: { imageUrl: media.sourceUrl, wpMediaId } });
      }

      const creds = await getSiteCredentials(line.wpSiteId);
      const post = await createPost(creds, {
        title: finalTitulo,
        contentHtml,
        status: line.statusWp === "DRAFT" ? "draft" : "publish",
        excerpt: excerpt ?? undefined,
        slug: slug ?? undefined,
        categoryId: line.categoriaWpId ?? undefined,
        featuredMediaId: wpMediaId,
      });

      await prisma.article.update({
        where: { id: article.id },
        data: {
          wpPostId: post.id,
          wpUrl: post.link,
          status: line.statusWp === "DRAFT" ? "RASCUNHO" : "PUBLICADO",
          publishedAt: new Date(),
          erroMsg: null,
        },
      });

      lastError = undefined;
      log({ lineId, event: "publicado", detail: post.link });
      break;
    } catch (err) {
      lastError = err;
      if (isRateLimit(err)) {
        rateLimited = true;
        log({ lineId, event: "rate_limit_geracao", detail: toUserMessage(err) });
        break;
      }
      log({ lineId, event: `falha_tentativa_${attempt}`, detail: toUserMessage(err) });
      if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** attempt);
    }
  }

  if (rateLimited) {
    await prisma.article.update({ where: { id: article.id }, data: { status: "FALHA", erroMsg: toUserMessage(lastError) } });
    await handleRateLimit(line.id, line.rateLimitBehavior);
    log({ lineId, event: "rate_limit_pos_processado", detail: line.rateLimitBehavior });
    return;
  }

  if (lastError) {
    const message = toUserMessage(lastError);
    await prisma.article.update({ where: { id: article.id }, data: { status: "FALHA", erroMsg: message } });
    await handleDeterministicFailure(line.id, line.consecutiveFailures, message, line.intervaloMin);
    return;
  }

  // Sucesso: zera falhas consecutivas, incrementa contador, repõe a fila de títulos.
  const geradosCount = line.geradosCount + 1;
  const atingiuMaximo = !!line.maxArtigos && geradosCount >= line.maxArtigos;

  await prisma.productionLine.update({
    where: { id: lineId },
    data: {
      geradosCount,
      consecutiveFailures: 0,
      lastRunAt: new Date(),
      ...(atingiuMaximo
        ? { status: "CONCLUIDA", pauseReason: "Máximo de artigos atingido.", nextRunAt: null }
        : { nextRunAt: new Date(Date.now() + jitteredIntervalMs(line.intervaloMin)) }),
    },
  });

  if (!atingiuMaximo) {
    await replenishTitleQueue(redis, line.id, textProvider, line.iaTexto, line.tipoArtigo as ArticleTypeSlug, line.temas, line.intervaloMin).catch((err) =>
      log({ lineId, event: "falha_reposicao_fila", detail: toUserMessage(err) })
    );
  }
}

async function handleDeterministicFailure(lineId: string, currentFailures: number, message: string, intervaloMin: number): Promise<void> {
  const consecutiveFailures = currentFailures + 1;
  const shouldPause = consecutiveFailures >= CONSECUTIVE_FAILURES_TO_PAUSE;
  const nextRunAt = new Date(Date.now() + jitteredIntervalMs(intervaloMin));

  await prisma.productionLine.update({
    where: { id: lineId },
    data: {
      consecutiveFailures,
      lastRunAt: new Date(),
      ...(shouldPause
        ? { status: "PAUSADA", pauseReason: `Pausada após ${consecutiveFailures} falhas consecutivas: ${message}`, nextRunAt: null }
        : { nextRunAt }),
    },
  });
}

async function handleRateLimit(lineId: string, behavior: string): Promise<void> {
  if (behavior === "PAUSAR") {
    await prisma.productionLine.update({
      where: { id: lineId },
      data: { status: "PAUSADA", pauseReason: "Pausada: limite de uso do provedor de IA atingido." },
    });
    return;
  }
  // ADIAR: não conta como falha, só empurra o próximo disparo para mais tarde.
  const nextRunAt = new Date(Date.now() + RATE_LIMIT_DEFER_MS);
  await prisma.productionLine.update({ where: { id: lineId }, data: { nextRunAt, lastRunAt: new Date() } });
}

async function getUsedTitles(lineId: string): Promise<string[]> {
  const [queued, published] = await Promise.all([
    prisma.titleQueueItem.findMany({ where: { lineId }, select: { titulo: true } }),
    prisma.article.findMany({ where: { lineId }, select: { titulo: true } }),
  ]);
  return [...queued.map((t) => t.titulo), ...published.map((a) => a.titulo)];
}

async function loadReferenceImages(lineId: string) {
  const images = await prisma.lineReferenceImage.findMany({ where: { lineId }, orderBy: { ordem: "asc" } });
  if (images.length === 0) return undefined;

  const driver = getStorageDriver();
  const results = await Promise.all(
    images.map(async (img) => {
      const key = img.storageUrl.replace("/api/uploads/", "");
      const buffer = await driver.read(key).catch(() => null);
      if (!buffer) return null;
      const ext = path.extname(key).toLowerCase();
      const mimeType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
      return { base64: buffer.toString("base64"), mimeType };
    })
  );
  return results.filter((r): r is { base64: string; mimeType: string } => r !== null);
}

async function replenishTitleQueue(
  redis: Redis,
  lineId: string,
  textProvider: ReturnType<typeof createTextProvider>,
  iaTexto: string,
  tipoArtigo: ArticleTypeSlug,
  temas: string[],
  intervaloMin: number
): Promise<void> {
  const line = await prisma.productionLine.findUnique({ where: { id: lineId } });
  if (!line || line.status !== "ATIVA") return;

  const queueCount = await prisma.titleQueueItem.count({ where: { lineId, status: "NA_FILA" } });
  if (queueCount >= 3) return;

  const tema = pickRandomTema(temas);
  const usados = await getUsedTitles(lineId);
  const sugestoes = await withProviderSlot(redis, iaTexto, () =>
    textProvider.generateTitles({ tipo: tipoArtigo, tema, quantidade: 1, titulosExistentes: usados })
  );
  const titulo = sugestoes[0];
  if (!titulo) return;

  const last = await prisma.titleQueueItem.findFirst({ where: { lineId, status: "NA_FILA" }, orderBy: { previstoPara: "desc" } });
  const base = last?.previstoPara ?? new Date();
  const previstoPara = new Date(base.getTime() + intervaloMin * 60_000);
  await prisma.titleQueueItem.create({ data: { lineId, titulo, previstoPara, status: "NA_FILA" } });
}
