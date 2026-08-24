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
  yield { step: "conteudo", status: "done" };

  // 3. Imagem
  yield { step: "imagem", status: "start" };
  let imageBase64: string;
  let imageMimeType: string;
  try {
    const imagem = await imageProvider.generateImage({ prompt: buildImagePrompt(finalTitulo, params.tema) });
    imageBase64 = imagem.base64;
    imageMimeType = imagem.mimeType;
  } catch (err) {
    yield await fail("imagem", err);
    return;
  }
  yield { step: "imagem", status: "done" };

  // 4. Publicando
  yield { step: "publicando", status: "start" };
  try {
    const creds = await getSiteCredentials(params.userId, params.wpSiteId);
    const ext = imageMimeType === "image/jpeg" ? "jpg" : "png";
    const media = await uploadMedia(creds, { filename: `${slug || "imagem"}.${ext}`, mimeType: imageMimeType, data: Buffer.from(imageBase64, "base64") });
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
        titulo: finalTitulo,
        contentHtml,
        excerpt,
        slug,
        imageUrl: media.sourceUrl,
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
