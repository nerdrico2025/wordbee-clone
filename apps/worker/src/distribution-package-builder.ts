import type { Redis } from "ioredis";
import { Prisma, prisma } from "@wordbee/db";
import type { AiProviderName, ArticleTypeSlug, GeneratedDistributionCopy } from "@wordbee/shared";
import {
  createTextProvider,
  createImageProvider,
  uploadMedia,
  AiProviderError,
  WordPressError,
  ARTICLE_TYPE_PROMPTS,
  buildAlbumImagePrompt,
  buildSearchUrl,
  MAX_IMAGENS_PACOTE,
} from "@wordbee/shared";
import { getDecryptedApiKey } from "./api-keys.js";
import { getSiteCredentials } from "./wp-sites.js";
import { findEligiblePages } from "./facebook-pages.js";
import { withProviderSlot } from "./provider-concurrency.js";
import { jitteredMs } from "./jitter.js";

/**
 * Montagem dos pacotes de distribuição.
 *
 * Divisão em duas etapas, de propósito:
 *
 *   1. `enqueueDistributionPackages` — varredura BARATA (só Postgres, zero
 *      IA) que encontra artigos recém-publicados sem pacote e cria a linha
 *      em `distribution_packages` com status PENDENTE.
 *   2. `buildDistributionPackage` — processa um pacote já reivindicado:
 *      gera as copies (e, se for álbum, as imagens) via IA, e agenda uma
 *      publicação por Página elegível.
 *
 * É o mesmo princípio de "cria o registro primeiro, processa depois" que o
 * `line-pipeline.ts` já usa com `articles`: se o worker morrer no meio da
 * geração, o pacote continua PENDENTE e é retomado no tick seguinte, sem
 * duplicar nada e sem perder o artigo de vista.
 *
 * Um pacote serve aos DOIS trilhos: as publicações automáticas em Páginas
 * (criadas aqui) e a fila de distribuição manual, montada pelo usuário na
 * tela. Por isso um pacote é montado mesmo quando não há nenhuma Página do
 * Facebook cadastrada — desde que exista pelo menos um perfil de divulgação
 * ativo, ou seja, alguém para quem a fila manual faça sentido.
 *
 * Por que a geração roda no WORKER e não dentro do pipeline de publicação
 * do artigo: (a) a geração unitária "Criar Artigo" roda numa função
 * serverless da Vercel com timeout apertado — somar chamadas de IA ali
 * arriscaria cortar a publicação do artigo, que é o que realmente importa;
 * (b) aqui a chamada de IA passa pelo semáforo `provider-slot` e pelo lock
 * em Postgres, que só existem no worker; (c) um caminho só cobre artigo de
 * Linha de Produção E artigo manual. Ver DECISIONS.md.
 */

/** Janela de "recém-publicado". Impede que o primeiro deploy da feature varra todo o histórico de artigos. */
const LOOKBACK_MS = Number(process.env.DISTRIBUTION_LOOKBACK_MS ?? String(6 * 60 * 60_000));
/** Quantos artigos a varredura considera por tick. */
const ENQUEUE_BATCH = Number(process.env.DISTRIBUTION_ENQUEUE_BATCH ?? "20");
/** Espaçamento base entre publicações do mesmo pacote em Páginas diferentes. */
const PAGE_SPACING_MS = Number(process.env.DISTRIBUTION_PAGE_SPACING_MS ?? String(10 * 60_000));
/** Atraso base antes da primeira publicação de um pacote. */
const FIRST_POST_DELAY_MS = Number(process.env.DISTRIBUTION_FIRST_POST_DELAY_MS ?? String(5 * 60_000));
/** Tentativas de montagem antes de desistir de um pacote. */
const MAX_BUILD_ATTEMPTS = Number(process.env.DISTRIBUTION_MAX_BUILD_ATTEMPTS ?? "3");
/** Quantas variações de copy pedir numa única chamada de IA. */
const COPY_VARIACOES = Number(process.env.DISTRIBUTION_COPY_VARIACOES ?? "3");

export interface DistributionLog {
  event: string;
  detail?: string;
  packageId?: string;
}

export type DistributionLogFn = (log: DistributionLog) => void;

function toUserMessage(err: unknown): string {
  if (err instanceof AiProviderError) return err.userMessage;
  if (err instanceof WordPressError) return err.userMessage;
  if (err instanceof Error) return err.message;
  return "Erro inesperado ao montar o pacote de distribuição.";
}

function isRateLimit(err: unknown): boolean {
  return err instanceof AiProviderError && (err.code === "rate_limit" || err.code === "unavailable");
}

/**
 * Um artigo só vira pacote se houver para onde distribuí-lo: uma Página do
 * Facebook elegível (trilho automático) OU pelo menos um perfil de
 * divulgação ativo (trilho assistido). Sem nenhum dos dois, não se cria
 * linha nenhuma — e portanto não se gasta IA — porque o pacote não teria
 * uso.
 */
async function contarPerfisAtivos(userId: string): Promise<number> {
  return prisma.divulgacaoPerfil.count({ where: { userId, ativo: true } });
}

/**
 * Cria pacotes PENDENTE para artigos publicados recentemente que ainda não
 * têm um. Nunca chama IA.
 */
export async function enqueueDistributionPackages(log: DistributionLogFn = () => undefined): Promise<number> {
  const desde = new Date(Date.now() - LOOKBACK_MS);

  const artigos = await prisma.article.findMany({
    where: {
      status: "PUBLICADO",
      publishedAt: { gte: desde },
      // Sem URL pública não há para onde mandar tráfego (rascunhos e
      // artigos com falha nunca entram por causa do status acima).
      wpUrl: { not: null },
      distributionPackages: { none: { tipo: "CAPTACAO" } },
    },
    orderBy: { publishedAt: "asc" },
    take: ENQUEUE_BATCH,
    select: { id: true, userId: true, wpSiteId: true },
  });

  // App de usuário único, mas a contagem é por userId e o lote pode ter
  // vários artigos — um cache local evita repetir a mesma query por artigo.
  const perfisAtivosPorUsuario = new Map<string, number>();

  let criados = 0;
  for (const artigo of artigos) {
    const paginas = await findEligiblePages(artigo.userId, artigo.wpSiteId);

    if (paginas.length === 0) {
      let perfisAtivos = perfisAtivosPorUsuario.get(artigo.userId);
      if (perfisAtivos === undefined) {
        perfisAtivos = await contarPerfisAtivos(artigo.userId);
        perfisAtivosPorUsuario.set(artigo.userId, perfisAtivos);
      }
      if (perfisAtivos === 0) continue;
    }

    try {
      const pacote = await prisma.distributionPackage.create({
        data: { userId: artigo.userId, articleId: artigo.id, tipo: "CAPTACAO", status: "PENDENTE", imagens: [] },
        select: { id: true },
      });
      criados++;
      log({ event: "pacote_enfileirado", packageId: pacote.id, detail: artigo.id });
    } catch (err) {
      // P2002 na unique (article_id, tipo): outra réplica do worker criou o
      // mesmo pacote entre o findMany e este create. É o resultado correto,
      // não um erro.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }

  return criados;
}

/**
 * Monta um pacote já reivindicado: gera copy (com variações), resolve as
 * imagens e agenda uma publicação por Página elegível.
 *
 * Nunca lança — toda falha vira estado no banco (mesma garantia de
 * `runProductionLine`), porque quem chama precisa liberar o lock no
 * `finally` e seguir para o próximo item.
 */
export async function buildDistributionPackage(
  redis: Redis,
  packageId: string,
  log: DistributionLogFn = () => undefined
): Promise<void> {
  try {
    await buildDistributionPackageInner(redis, packageId, log);
  } catch (err) {
    const message = toUserMessage(err);
    console.error(`[distribuicao] erro inesperado ao montar o pacote ${packageId}:`, err);
    log({ event: "erro_inesperado_pacote", packageId, detail: message });
    await registerBuildFailure(packageId, message).catch((dbErr) =>
      console.error(`[distribuicao] falha ao registrar erro do pacote ${packageId}:`, dbErr)
    );
  }
}

async function buildDistributionPackageInner(redis: Redis, packageId: string, log: DistributionLogFn): Promise<void> {
  const pacote = await prisma.distributionPackage.findUnique({
    where: { id: packageId },
    include: { article: true },
  });

  if (!pacote) {
    log({ event: "pacote_nao_encontrado", packageId });
    return;
  }
  if (pacote.status !== "PENDENTE") {
    log({ event: "pacote_nao_pendente", packageId, detail: pacote.status });
    return;
  }

  const artigo = pacote.article;
  if (!artigo) {
    // Pacote exploratório sem artigo (tema solto, sem conteúdo publicado
    // ainda) é conceito deixado fora do escopo por decisão do Rafael — ver
    // DECISIONS.md. Deixa PENDENTE e sai sem consumir tentativa.
    log({ event: "pacote_sem_artigo_ignorado", packageId });
    return;
  }
  if (!artigo.wpUrl) {
    await registerBuildFailure(packageId, "O artigo não tem URL pública para divulgar.");
    log({ event: "pacote_artigo_sem_url", packageId });
    return;
  }

  const paginas = await findEligiblePages(pacote.userId, artigo.wpSiteId);
  if (paginas.length === 0 && (await contarPerfisAtivos(pacote.userId)) === 0) {
    await registerBuildFailure(
      packageId,
      "Nenhuma Página do Facebook válida nem perfil de divulgação ativo — o pacote não teria para onde ir."
    );
    log({ event: "pacote_sem_destino", packageId });
    return;
  }

  const iaTexto = artigo.iaTexto as AiProviderName | null;
  if (!iaTexto) {
    await registerBuildFailure(packageId, "Provedor de texto do artigo não registrado — não é possível gerar a copy.");
    log({ event: "pacote_sem_provedor", packageId });
    return;
  }

  const apiKey = await getDecryptedApiKey(pacote.userId, iaTexto, "TEXTO");
  if (!apiKey) {
    await registerBuildFailure(packageId, "Chave de IA de texto não configurada para gerar a copy de distribuição.");
    log({ event: "pacote_sem_chave", packageId });
    return;
  }

  // O link é resolvido ANTES da copy porque a copy do comentário é
  // guardada já com ele anexado. CAPTACAO leva ao artigo; DIRETO_SITE leva
  // à página de busca do blog pelo tema (conceito da Aula 4: mais artigos
  // do tema e mais anúncios antes do conteúdo).
  let linkDestino: string;
  try {
    linkDestino = await resolveLinkDestino(pacote.tipo, artigo);
  } catch (err) {
    await registerBuildFailure(packageId, toUserMessage(err));
    log({ event: "pacote_falha_link", packageId, detail: toUserMessage(err) });
    return;
  }

  const textProvider = createTextProvider(iaTexto, apiKey);
  const tipoLabel = ARTICLE_TYPE_PROMPTS[artigo.tipo as ArticleTypeSlug].label;

  let variacoes: GeneratedDistributionCopy[];
  try {
    variacoes = await withProviderSlot(redis, iaTexto, () =>
      textProvider.generateDistributionCopy({
        titulo: artigo.titulo,
        tema: artigo.tema ?? undefined,
        tipoLabel,
        tipoPacote: pacote.tipo,
        quantidade: Math.max(1, COPY_VARIACOES),
      })
    );
  } catch (err) {
    if (isRateLimit(err)) {
      // Rate limit não conta como tentativa: o pacote fica PENDENTE e é
      // reprocessado no próximo tick (mesma leitura de "ADIAR" das Linhas
      // de Produção — a espera vem do intervalo do cron).
      log({ event: "pacote_rate_limit", packageId, detail: toUserMessage(err) });
      return;
    }
    await registerBuildFailure(packageId, toUserMessage(err));
    log({ event: "pacote_falha_copy", packageId, detail: toUserMessage(err) });
    return;
  }

  const escolhida = variacoes[0]!;

  let imagens: string[];
  try {
    imagens = await resolveImagens(redis, pacote, artigo, log);
  } catch (err) {
    if (isRateLimit(err)) {
      log({ event: "pacote_rate_limit_imagem", packageId, detail: toUserMessage(err) });
      return;
    }
    await registerBuildFailure(packageId, toUserMessage(err));
    log({ event: "pacote_falha_imagem", packageId, detail: toUserMessage(err) });
    return;
  }

  // O link é anexado aqui, nunca escrito pelo modelo (ver
  // packages/shared/src/prompts/distribution.ts) — um link inventado ou
  // truncado desperdiçaria a publicação inteira. As variações ficam
  // guardadas CRUAS (sem link) para que trocar a variação ativa na tela
  // reanexe o link certo, incluindo o link curto rastreado da fila manual.
  const copyComentario = `${escolhida.copyComentario}\n\n${linkDestino}`;

  const agora = Date.now();
  await prisma.$transaction([
    prisma.distributionPackage.update({
      where: { id: packageId },
      data: {
        status: "PRONTO",
        copyDescricao: escolhida.copyDescricao,
        copyComentario,
        copyVariacoes: variacoes as unknown as Prisma.InputJsonValue,
        linkDestino,
        imagens,
        erroMsg: null,
      },
    }),
    prisma.pageDistributionPost.createMany({
      data: paginas.map((pagina, index) => ({
        packageId,
        facebookPageId: pagina.id,
        status: "AGENDADO" as const,
        // Uma Página por vez, espaçadas: publicar o mesmo conteúdo em
        // várias Páginas no mesmo segundo é exatamente o padrão que
        // sistemas antispam procuram. `jitteredMs` quebra a regularidade.
        scheduledFor: new Date(agora + jitteredMs(FIRST_POST_DELAY_MS + index * PAGE_SPACING_MS)),
      })),
      // A unique (package_id, facebook_page_id) já garante que um pacote
      // nunca gera duas publicações para a mesma Página; `skipDuplicates`
      // torna esta etapa segura de repetir depois de um crash.
      skipDuplicates: true,
    }),
  ]);

  log({
    event: "pacote_pronto",
    packageId,
    detail: `${variacoes.length} variação(ões) de copy, ${imagens.length} imagem(ns), ${paginas.length} publicação(ões) agendada(s)`,
  });
}

/**
 * CAPTACAO leva ao artigo. DIRETO_SITE leva à página de busca do blog pelo
 * tema — a regra de "só quando o tema já tem vários artigos" é aplicada na
 * tela, no momento de criar o pacote (é lá que o usuário decide); aqui só
 * se monta a URL do tipo que foi escolhido.
 */
async function resolveLinkDestino(
  tipo: "CAPTACAO" | "DIRETO_SITE",
  artigo: { wpUrl: string | null; wpSiteId: string; tema: string | null; titulo: string }
): Promise<string> {
  if (tipo === "CAPTACAO") return artigo.wpUrl!;

  const site = await prisma.wpSite.findUnique({ where: { id: artigo.wpSiteId }, select: { url: true } });
  if (!site) throw new Error("Site do artigo não encontrado para montar o link de busca.");
  return buildSearchUrl(site.url, artigo.tema ?? artigo.titulo);
}

/**
 * Resolve as imagens do pacote.
 *
 * `imagensAlvo === 1` (padrão) reaproveita a imagem destacada do artigo —
 * zero custo de IA e nenhuma dependência nova de storage, já que ela já
 * está hospedada publicamente no próprio WordPress.
 *
 * `imagensAlvo > 1` monta um álbum: gera as imagens que faltam via
 * `ImageProvider` e **envia cada uma como mídia para o WordPress do
 * artigo**, usando o `uploadMedia` que já existe. É de propósito: uma
 * imagem gerada precisa de uma URL pública para servir aos dois trilhos (a
 * Meta busca a foto por URL; a pessoa que posta no grupo precisa abrir e
 * salvar a imagem), e o storage local do worker não tem URL pública — é a
 * lacuna conhecida do projeto (`STORAGE_DRIVER=local`, sem driver S3, com
 * web e worker em hosts diferentes). O WordPress do próprio artigo já é um
 * host de mídia público para o qual temos credencial. Ver DECISIONS.md.
 *
 * Falha de uma imagem isolada não derruba o pacote: fica o que deu certo.
 * Rate limit propaga, para o pacote inteiro ser adiado.
 */
async function resolveImagens(
  redis: Redis,
  pacote: { id: string; userId: string; imagensAlvo: number },
  artigo: { imageUrl: string | null; wpSiteId: string; titulo: string; tema: string | null; iaImagem: string | null; slug: string | null },
  log: DistributionLogFn
): Promise<string[]> {
  const alvo = Math.min(Math.max(1, pacote.imagensAlvo), MAX_IMAGENS_PACOTE);
  const imagens: string[] = artigo.imageUrl ? [artigo.imageUrl] : [];

  if (alvo <= imagens.length) return imagens;

  const iaImagem = artigo.iaImagem as AiProviderName | null;
  if (!iaImagem) {
    log({ event: "album_sem_provedor_imagem", packageId: pacote.id });
    return imagens;
  }

  const apiKey = await getDecryptedApiKey(pacote.userId, iaImagem, "IMAGEM");
  if (!apiKey) {
    log({ event: "album_sem_chave_imagem", packageId: pacote.id });
    return imagens;
  }

  const imageProvider = createImageProvider(iaImagem, apiKey);
  const creds = await getSiteCredentials(artigo.wpSiteId);
  const tema = artigo.tema ?? artigo.titulo;

  for (let i = imagens.length; i < alvo; i++) {
    try {
      const gerada = await withProviderSlot(redis, iaImagem, () =>
        imageProvider.generateImage({ prompt: buildAlbumImagePrompt(artigo.titulo, tema, i) })
      );
      const ext = gerada.mimeType === "image/jpeg" ? "jpg" : "png";
      const media = await uploadMedia(creds, {
        filename: `${artigo.slug || "album"}-divulgacao-${i + 1}.${ext}`,
        mimeType: gerada.mimeType,
        data: Buffer.from(gerada.base64, "base64"),
      });
      imagens.push(media.sourceUrl);
    } catch (err) {
      if (isRateLimit(err)) throw err;
      // Uma foto a menos num álbum é muito melhor que nenhum pacote.
      log({ event: "album_imagem_falhou", packageId: pacote.id, detail: toUserMessage(err) });
      break;
    }
  }

  return imagens;
}

/**
 * Conta a tentativa e desiste depois de `MAX_BUILD_ATTEMPTS`. Sem esse
 * teto, um pacote com erro determinístico (ex.: chave removida) seria
 * reprocessado a cada tick para sempre.
 */
async function registerBuildFailure(packageId: string, message: string): Promise<void> {
  const pacote = await prisma.distributionPackage.findUnique({ where: { id: packageId }, select: { tentativas: true } });
  if (!pacote) return;

  const tentativas = pacote.tentativas + 1;
  await prisma.distributionPackage.update({
    where: { id: packageId },
    data: {
      tentativas,
      erroMsg: message,
      ...(tentativas >= MAX_BUILD_ATTEMPTS ? { status: "FALHA" as const } : {}),
    },
  });
}
