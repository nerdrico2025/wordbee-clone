import { prisma } from "@wordbee/db";
import { publishPhotoPost, publishLinkPost, commentOnPost, FacebookError } from "@wordbee/shared";
import { getPageCredentials } from "./facebook-pages.js";
import { jitteredMs } from "./jitter.js";

/**
 * Publica um pacote de distribuição numa Página do Facebook, via Graph API
 * oficial: post com a copy de descrição + primeiro comentário com o link.
 *
 * Limite de escopo permanente: este pipeline publica em PÁGINAS e só em
 * Páginas. Não há aqui — nem deve ser adicionado — qualquer caminho que
 * publique em Grupos ou perfis pessoais. Ver a seção "Limite de escopo" de
 * plano-acao-claude-code-distribuicao.md e DECISIONS.md (2026-08-31).
 *
 * Nunca lança: toda falha vira estado no banco, igual a `runProductionLine`.
 */

const MAX_ATTEMPTS = Number(process.env.DISTRIBUTION_MAX_PUBLISH_ATTEMPTS ?? "3");
/** Espera antes de retentar uma falha transitória (rede, indisponibilidade do Facebook). */
const RETRY_BASE_MS = Number(process.env.DISTRIBUTION_RETRY_BASE_MS ?? String(5 * 60_000));
/** Espera antes de retentar quando o Facebook aplicou rate limit — bem maior que a de rede. */
const RATE_LIMIT_DEFER_MS = Number(process.env.DISTRIBUTION_RATE_LIMIT_DEFER_MS ?? String(60 * 60_000));

export interface PagePostLog {
  postId: string;
  event: string;
  detail?: string;
}

export type PagePostLogFn = (log: PagePostLog) => void;

function toUserMessage(err: unknown): string {
  if (err instanceof FacebookError) return err.userMessage;
  if (err instanceof Error) return err.message;
  return "Erro inesperado ao publicar no Facebook.";
}

/** Erro de credencial: retentar não adianta enquanto o usuário não agir. */
function isCredentialError(err: unknown): boolean {
  return err instanceof FacebookError && (err.code === "invalid_token" || err.code === "permission");
}

function isTransient(err: unknown): boolean {
  return err instanceof FacebookError && (err.code === "network" || err.code === "timeout" || err.code === "unavailable");
}

function isRateLimit(err: unknown): boolean {
  return err instanceof FacebookError && err.code === "rate_limit";
}

export async function publishPageDistributionPost(postId: string, log: PagePostLogFn = () => undefined): Promise<void> {
  try {
    await publishPageDistributionPostInner(postId, log);
  } catch (err) {
    const message = toUserMessage(err);
    console.error(`[distribuicao] erro inesperado ao publicar a distribuição ${postId}:`, err);
    log({ postId, event: "erro_inesperado", detail: message });
    await prisma.pageDistributionPost
      .updateMany({ where: { id: postId }, data: { status: "FALHA", erroMsg: message } })
      .catch((dbErr) => console.error(`[distribuicao] falha ao registrar erro da distribuição ${postId}:`, dbErr));
  }
}

async function publishPageDistributionPostInner(postId: string, log: PagePostLogFn): Promise<void> {
  const post = await prisma.pageDistributionPost.findUnique({
    where: { id: postId },
    include: { package: true },
  });

  if (!post) {
    log({ postId, event: "distribuicao_nao_encontrada" });
    return;
  }
  if (post.status === "PUBLICADO" || post.status === "FALHA") {
    log({ postId, event: "distribuicao_ja_finalizada", detail: post.status });
    return;
  }

  const pacote = post.package;
  if (pacote.status !== "PRONTO" || !pacote.copyDescricao || !pacote.copyComentario) {
    // Só acontece se o pacote falhou depois de já ter agendado publicações.
    await finalizeFailure(postId, "O pacote de distribuição não está pronto.");
    log({ postId, event: "pacote_nao_pronto", detail: pacote.status });
    return;
  }

  let creds;
  try {
    creds = await getPageCredentials(post.facebookPageId);
  } catch (err) {
    await finalizeFailure(postId, toUserMessage(err));
    log({ postId, event: "pagina_indisponivel", detail: toUserMessage(err) });
    return;
  }

  try {
    // Retomada parcial: se o post já foi criado numa tentativa anterior
    // (mas o comentário falhou), NUNCA republica — só termina o que falta.
    // Republicar geraria conteúdo duplicado na Página, que é justamente o
    // que o algoritmo do Facebook penaliza. Mesmo princípio do retry
    // parcial de artigos (`wpMediaId` já enviado não é regerado).
    let fbPostId = post.fbPostId;

    if (!fbPostId) {
      const imagem = pacote.imagens[0];
      let publicado;
      if (imagem) {
        publicado = await publishPhotoPost(creds, { mensagem: pacote.copyDescricao, imagemUrl: imagem });
      } else if (pacote.linkDestino) {
        // Sem imagem no pacote, cai para post de link. É um fallback
        // degradado de propósito: a mecânica de captação quer o link no
        // comentário, não na descrição — mas um post sem imagem e sem link
        // nenhum não leva a lugar nenhum. Ver DECISIONS.md.
        publicado = await publishLinkPost(creds, { mensagem: pacote.copyDescricao, link: pacote.linkDestino });
      } else {
        // Nem imagem nem link: não existe publicação que faça sentido aqui.
        // Falhar é melhor que postar um texto solto que não leva ninguém a
        // lugar nenhum (e ainda queima alcance da Página).
        await finalizeFailure(postId, "O pacote não tem imagem nem link de destino para publicar.");
        log({ postId, event: "pacote_sem_conteudo" });
        return;
      }

      fbPostId = publicado.postId;
      // Grava o id ANTES de comentar: se o processo morrer entre as duas
      // chamadas, a retomada acima evita um post duplicado.
      await prisma.pageDistributionPost.update({ where: { id: postId }, data: { fbPostId } });
      log({ postId, event: "post_publicado", detail: fbPostId });
    }

    const comentario = await commentOnPost(creds, fbPostId, pacote.copyComentario);

    await prisma.pageDistributionPost.update({
      where: { id: postId },
      data: {
        status: "PUBLICADO",
        fbCommentId: comentario.commentId,
        publishedAt: new Date(),
        erroMsg: null,
      },
    });
    log({ postId, event: "distribuicao_publicada", detail: fbPostId });
  } catch (err) {
    const message = toUserMessage(err);

    if (isCredentialError(err)) {
      // Marca a Página como inválida: ela para de receber NOVOS agendamentos
      // (`findEligiblePages` filtra por `statusValidacao`) até o usuário
      // testar/atualizar o token na tela. Sem isso, cada artigo novo
      // empilharia mais publicações fadadas a falhar.
      await prisma.facebookPage.updateMany({
        where: { id: post.facebookPageId },
        data: { statusValidacao: false, lastError: message, lastValidatedAt: new Date() },
      });
      await finalizeFailure(postId, message);
      log({ postId, event: "falha_credencial", detail: message });
      return;
    }

    const tentativas = post.tentativas + 1;
    if (tentativas >= MAX_ATTEMPTS || !(isTransient(err) || isRateLimit(err))) {
      await finalizeFailure(postId, message, tentativas);
      log({ postId, event: "distribuicao_falhou", detail: message });
      return;
    }

    const esperaMs = isRateLimit(err) ? RATE_LIMIT_DEFER_MS : RETRY_BASE_MS * 2 ** (tentativas - 1);
    await prisma.pageDistributionPost.update({
      where: { id: postId },
      data: {
        status: "PENDENTE",
        tentativas,
        erroMsg: message,
        scheduledFor: new Date(Date.now() + jitteredMs(esperaMs)),
      },
    });
    log({ postId, event: isRateLimit(err) ? "distribuicao_adiada_rate_limit" : "distribuicao_reagendada", detail: message });
  }
}

async function finalizeFailure(postId: string, message: string, tentativas?: number): Promise<void> {
  await prisma.pageDistributionPost.updateMany({
    where: { id: postId },
    data: { status: "FALHA", erroMsg: message, ...(tentativas !== undefined ? { tentativas } : {}) },
  });
}
