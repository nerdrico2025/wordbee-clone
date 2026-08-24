import "server-only";
import { prisma } from "@wordbee/db";
import type { AiProviderName, ArticleTypeSlug } from "@wordbee/shared";
import { createTextProvider, createImageProvider, AiProviderError, WordPressError, uploadMedia, createPost } from "@wordbee/shared";
import { getDecryptedApiKey } from "@/lib/api-keys";
import { getSiteCredentials } from "@/lib/wp-sites";

export interface UnitPipelineParams {
  userId: string;
  wpSiteId: string;
  categoriaWpId?: number;
  iaTexto: AiProviderName;
  iaImagem: AiProviderName;
  tipo: ArticleTypeSlug;
  tema: string;
  titulo?: string;
  promptCustomizado?: string;
  statusWp: "PUBLISH" | "DRAFT";
}

export type PipelineEvent =
  | { step: "titulo"; status: "start" }
  | { step: "titulo"; status: "done"; titulo: string }
  | { step: "conteudo"; status: "start" }
  | { step: "conteudo"; status: "done" }
  | { step: "imagem"; status: "start" }
  | { step: "imagem"; status: "done" }
  | { step: "publicando"; status: "start" }
  | { step: "publicando"; status: "done"; articleId: string; wpUrl: string }
  | { step: string; status: "error"; message: string };

function buildImagePrompt(titulo: string, tema: string): string {
  return `Imagem destacada para um artigo de blog em português sobre "${titulo}" (tema: ${tema}). Fotografia realista, boa iluminação, alta qualidade, sem texto ou letras sobrepostas na imagem.`;
}

export async function* runUnitArticlePipeline(params: UnitPipelineParams): AsyncGenerator<PipelineEvent> {
  const textKey = await getDecryptedApiKey(params.userId, params.iaTexto, "TEXTO");
  if (!textKey) {
    yield { step: "titulo", status: "error", message: "Nenhuma chave de IA de texto configurada para este provedor." };
    return;
  }
  const imageKey = await getDecryptedApiKey(params.userId, params.iaImagem, "IMAGEM");
  if (!imageKey) {
    yield { step: "titulo", status: "error", message: "Nenhuma chave de IA de imagem configurada para este provedor." };
    return;
  }

  const textProvider = createTextProvider(params.iaTexto, textKey);
  const imageProvider = createImageProvider(params.iaImagem, imageKey);

  // 1. Título
  yield { step: "titulo", status: "start" };
  let titulo = params.titulo?.trim();
  try {
    if (!titulo) {
      const sugestoes = await textProvider.generateTitles({ tipo: params.tipo, tema: params.tema, quantidade: 1 });
      titulo = sugestoes[0];
      if (!titulo) throw new AiProviderError("unknown", params.iaTexto.toLowerCase(), "nenhum título sugerido");
    }
  } catch (err) {
    yield { step: "titulo", status: "error", message: toUserMessage(err) };
    return;
  }
  yield { step: "titulo", status: "done", titulo };

  const article = await prisma.article.create({
    data: {
      userId: params.userId,
      wpSiteId: params.wpSiteId,
      titulo,
      tipo: params.tipo,
      origem: "MANUAL",
      status: "PROCESSANDO",
      iaTexto: params.iaTexto,
      iaImagem: params.iaImagem,
      categoriaWpId: params.categoriaWpId,
      wpStatusAlvo: params.statusWp,
      tema: params.tema,
      promptCustomizado: params.promptCustomizado,
    },
  });

  async function fail(step: string, err: unknown) {
    const message = toUserMessage(err);
    await prisma.article.update({ where: { id: article.id }, data: { status: "FALHA", erroMsg: message } });
    return { step, status: "error" as const, message };
  }

  // 2. Conteúdo
  yield { step: "conteudo", status: "start" };
  let contentHtml: string;
  let excerpt: string;
  let finalTitulo = titulo;
  let slug: string;
  try {
    const gerado = await textProvider.generateArticle({ tipo: params.tipo, tema: params.tema, titulo, promptCustomizado: params.promptCustomizado });
    contentHtml = gerado.contentHtml;
    excerpt = gerado.excerpt;
    slug = gerado.slug;
    if (gerado.metaTitle && gerado.metaTitle.length > 0 && gerado.metaTitle.length <= 60) {
      finalTitulo = gerado.metaTitle;
    }
  } catch (err) {
    yield await fail("conteudo", err);
    return;
  }
  // Persiste o que já foi gerado — permite reenvio sem regerar o conteúdo à toa.
  await prisma.article.update({ where: { id: article.id }, data: { titulo: finalTitulo, contentHtml, excerpt, slug } });
  yield { step: "conteudo", status: "done" };

  // 3. Imagem + upload
  yield { step: "imagem", status: "start" };
  let media: { id: number; sourceUrl: string };
  try {
    const imagem = await imageProvider.generateImage({ prompt: buildImagePrompt(finalTitulo, params.tema) });
    const creds = await getSiteCredentials(params.userId, params.wpSiteId);
    const ext = imagem.mimeType === "image/jpeg" ? "jpg" : "png";
    media = await uploadMedia(creds, { filename: `${slug || "imagem"}.${ext}`, mimeType: imagem.mimeType, data: Buffer.from(imagem.base64, "base64") });
  } catch (err) {
    yield await fail("imagem", err);
    return;
  }
  await prisma.article.update({ where: { id: article.id }, data: { imageUrl: media.sourceUrl, wpMediaId: media.id } });
  yield { step: "imagem", status: "done" };

  // 4. Publicando
  yield { step: "publicando", status: "start" };
  try {
    const creds = await getSiteCredentials(params.userId, params.wpSiteId);
    const post = await createPost(creds, {
      title: finalTitulo,
      contentHtml,
      status: params.statusWp === "PUBLISH" ? "publish" : "draft",
      excerpt,
      slug,
      categoryId: params.categoriaWpId,
      featuredMediaId: media.id,
    });

    await prisma.article.update({
      where: { id: article.id },
      data: {
        wpPostId: post.id,
        wpUrl: post.link,
        status: params.statusWp === "PUBLISH" ? "PUBLICADO" : "RASCUNHO",
        publishedAt: new Date(),
      },
    });

    yield { step: "publicando", status: "done", articleId: article.id, wpUrl: post.link };
  } catch (err) {
    yield await fail("publicando", err);
  }
}

function toUserMessage(err: unknown): string {
  if (err instanceof AiProviderError) return err.userMessage;
  if (err instanceof WordPressError) return err.userMessage;
  if (err instanceof Error) return err.message;
  return "Erro inesperado ao gerar o artigo.";
}

/**
 * Reenvia um artigo com falha (RF-32). Reaproveita o que já foi gerado
 * (conteúdo, imagem já enviada ao WordPress) em vez de regerar à toa —
 * só refaz a etapa que efetivamente falhou da última vez.
 */
export async function resendArticle(userId: string, articleId: string): Promise<{ ok: true; wpUrl: string } | { ok: false; message: string }> {
  const article = await prisma.article.findFirst({ where: { id: articleId, userId } });
  if (!article) return { ok: false, message: "Artigo não encontrado." };
  if (article.status !== "FALHA") return { ok: false, message: "Só é possível reenviar artigos com falha." };

  try {
    let contentHtml = article.contentHtml;
    let excerpt = article.excerpt;
    let slug = article.slug;
    let titulo = article.titulo;

    if (!contentHtml) {
      if (!article.iaTexto) throw new Error("Não é possível reenviar: provedor de texto original não registrado.");
      const textKey = await getDecryptedApiKey(userId, article.iaTexto, "TEXTO");
      if (!textKey) throw new AiProviderError("invalid_key", article.iaTexto.toLowerCase(), "chave não configurada");
      const textProvider = createTextProvider(article.iaTexto, textKey);
      const gerado = await textProvider.generateArticle({
        tipo: article.tipo,
        tema: article.tema ?? titulo,
        titulo,
        promptCustomizado: article.promptCustomizado ?? undefined,
      });
      contentHtml = gerado.contentHtml;
      excerpt = gerado.excerpt;
      slug = gerado.slug;
      if (gerado.metaTitle && gerado.metaTitle.length > 0 && gerado.metaTitle.length <= 60) titulo = gerado.metaTitle;
      await prisma.article.update({ where: { id: article.id }, data: { titulo, contentHtml, excerpt, slug } });
    }

    let wpMediaId = article.wpMediaId;
    if (!wpMediaId) {
      if (!article.iaImagem) throw new Error("Não é possível reenviar: provedor de imagem original não registrado.");
      const imageKey = await getDecryptedApiKey(userId, article.iaImagem, "IMAGEM");
      if (!imageKey) throw new AiProviderError("invalid_key", article.iaImagem.toLowerCase(), "chave não configurada");
      const imageProvider = createImageProvider(article.iaImagem, imageKey);
      const imagem = await imageProvider.generateImage({ prompt: buildImagePrompt(titulo, article.tema ?? titulo) });
      const creds = await getSiteCredentials(userId, article.wpSiteId);
      const ext = imagem.mimeType === "image/jpeg" ? "jpg" : "png";
      const media = await uploadMedia(creds, { filename: `${slug || "imagem"}.${ext}`, mimeType: imagem.mimeType, data: Buffer.from(imagem.base64, "base64") });
      wpMediaId = media.id;
      await prisma.article.update({ where: { id: article.id }, data: { imageUrl: media.sourceUrl, wpMediaId } });
    }

    const creds = await getSiteCredentials(userId, article.wpSiteId);
    const post = await createPost(creds, {
      title: titulo,
      contentHtml,
      status: article.wpStatusAlvo === "DRAFT" ? "draft" : "publish",
      excerpt: excerpt ?? undefined,
      slug: slug ?? undefined,
      categoryId: article.categoriaWpId ?? undefined,
      featuredMediaId: wpMediaId,
    });

    await prisma.article.update({
      where: { id: article.id },
      data: {
        wpPostId: post.id,
        wpUrl: post.link,
        status: article.wpStatusAlvo === "DRAFT" ? "RASCUNHO" : "PUBLICADO",
        publishedAt: new Date(),
        erroMsg: null,
      },
    });

    return { ok: true, wpUrl: post.link };
  } catch (err) {
    const message = toUserMessage(err);
    await prisma.article.update({ where: { id: article.id }, data: { status: "FALHA", erroMsg: message } });
    return { ok: false, message };
  }
}
