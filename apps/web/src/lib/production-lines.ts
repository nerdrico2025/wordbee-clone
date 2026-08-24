import "server-only";
import { prisma } from "@wordbee/db";
import type { AiProviderName, ArticleTypeSlug } from "@wordbee/shared";
import { createTextProvider, scheduleLineRun, cancelLineRun, getStorageDriver, AiProviderError } from "@wordbee/shared";
import { getDecryptedApiKey } from "@/lib/api-keys";

const MAX_REFERENCE_IMAGES = 5;

export async function addReferenceImage(userId: string, lineId: string, filename: string, mimeType: string, buffer: Buffer) {
  const line = await prisma.productionLine.findFirst({ where: { id: lineId, userId }, include: { referenceImages: true } });
  if (!line) throw new Error("Linha não encontrada.");
  if (line.referenceImages.length >= MAX_REFERENCE_IMAGES) {
    throw new Error(`Máximo de ${MAX_REFERENCE_IMAGES} imagens de referência por linha.`);
  }
  if (!/^image\/(png|jpe?g|webp)$/.test(mimeType)) {
    throw new Error("Tipo de arquivo não suportado. Envie PNG, JPEG ou WEBP.");
  }
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error("Imagem muito grande (máximo 5MB).");
  }

  const driver = getStorageDriver();
  const { key } = await driver.save({ buffer, filename });
  return prisma.lineReferenceImage.create({
    data: { lineId, storageUrl: driver.publicUrl(key), ordem: line.referenceImages.length },
  });
}

export async function deleteReferenceImage(userId: string, lineId: string, imageId: string) {
  const line = await prisma.productionLine.findFirst({ where: { id: lineId, userId } });
  if (!line) throw new Error("Linha não encontrada.");

  const image = await prisma.lineReferenceImage.findFirst({ where: { id: imageId, lineId } });
  if (!image) throw new Error("Imagem não encontrada.");

  const driver = getStorageDriver();
  const key = image.storageUrl.replace("/api/uploads/", "");
  await driver.delete(key).catch(() => undefined);
  await prisma.lineReferenceImage.delete({ where: { id: imageId } });
}

export interface CreateProductionLineInput {
  nome: string;
  wpSiteId: string;
  categoriaWpId?: number;
  categoriaWpNome?: string;
  iaTexto: AiProviderName;
  iaImagem: AiProviderName;
  tipoArtigo: ArticleTypeSlug;
  temas: string[];
  intervaloMin: number;
  maxArtigos?: number;
  statusWp: "PUBLISH" | "DRAFT";
  promptCustomizado?: string;
  rateLimitBehavior?: "ADIAR" | "PAUSAR";
}

export async function createProductionLine(userId: string, input: CreateProductionLineInput) {
  const line = await prisma.productionLine.create({
    data: {
      userId,
      wpSiteId: input.wpSiteId,
      nome: input.nome,
      categoriaWpId: input.categoriaWpId,
      categoriaWpNome: input.categoriaWpNome,
      iaTexto: input.iaTexto,
      iaImagem: input.iaImagem,
      tipoArtigo: input.tipoArtigo,
      temas: input.temas,
      intervaloMin: input.intervaloMin,
      maxArtigos: input.maxArtigos,
      statusWp: input.statusWp,
      promptCustomizado: input.promptCustomizado,
      rateLimitBehavior: input.rateLimitBehavior ?? "ADIAR",
      status: "ATIVA",
      nextRunAt: new Date(),
    },
  });

  await scheduleLineRun(line.id, 0);
  return line;
}

export async function pauseProductionLine(userId: string, lineId: string) {
  const line = await prisma.productionLine.findFirst({ where: { id: lineId, userId } });
  if (!line) throw new Error("Linha não encontrada.");

  await cancelLineRun(lineId);
  return prisma.productionLine.update({
    where: { id: lineId },
    data: { status: "PAUSADA", pauseReason: "Pausada manualmente pelo usuário." },
  });
}

export async function resumeProductionLine(userId: string, lineId: string) {
  const line = await prisma.productionLine.findFirst({ where: { id: lineId, userId } });
  if (!line) throw new Error("Linha não encontrada.");
  if (line.maxArtigos && line.geradosCount >= line.maxArtigos) {
    throw new Error("Esta linha já atingiu o máximo de artigos configurado.");
  }

  const nextRunAt = new Date();
  const updated = await prisma.productionLine.update({
    where: { id: lineId },
    data: { status: "ATIVA", pauseReason: null, consecutiveFailures: 0, nextRunAt },
  });
  await scheduleLineRun(lineId, 0);
  return updated;
}

export async function deleteProductionLine(userId: string, lineId: string) {
  const line = await prisma.productionLine.findFirst({ where: { id: lineId, userId } });
  if (!line) throw new Error("Linha não encontrada.");

  await cancelLineRun(lineId);
  await prisma.productionLine.delete({ where: { id: lineId } });
}

function pickRandomTema(temas: string[]): string {
  return temas[Math.floor(Math.random() * temas.length)]!;
}

export async function generateTitlesForLine(userId: string, lineId: string, quantidade = 3): Promise<void> {
  const line = await prisma.productionLine.findFirst({ where: { id: lineId, userId } });
  if (!line) throw new Error("Linha não encontrada.");

  const apiKey = await getDecryptedApiKey(userId, line.iaTexto as AiProviderName, "TEXTO");
  if (!apiKey) throw new AiProviderError("invalid_key", line.iaTexto.toLowerCase(), "chave não configurada");

  const [existingQueue, publishedTitles] = await Promise.all([
    prisma.titleQueueItem.findMany({ where: { lineId, status: "NA_FILA" }, select: { titulo: true, previstoPara: true }, orderBy: { previstoPara: "desc" }, take: 1 }),
    prisma.article.findMany({ where: { lineId }, select: { titulo: true } }),
  ]);

  const provider = createTextProvider(line.iaTexto as AiProviderName, apiKey);
  const titulosExistentes = [...publishedTitles.map((a) => a.titulo)];
  const allQueueTitles = await prisma.titleQueueItem.findMany({ where: { lineId, status: "NA_FILA" }, select: { titulo: true } });
  titulosExistentes.push(...allQueueTitles.map((t) => t.titulo));

  const previstoBase = existingQueue[0]?.previstoPara ?? line.nextRunAt ?? new Date();
  const startOffset = existingQueue.length > 0 ? 1 : 0;

  const novosTitulos: string[] = [];
  for (let i = 0; i < quantidade; i++) {
    const tema = pickRandomTema(line.temas);
    const sugestoes = await provider.generateTitles({
      tipo: line.tipoArtigo as ArticleTypeSlug,
      tema,
      quantidade: 1,
      titulosExistentes: [...titulosExistentes, ...novosTitulos],
    });
    const titulo = sugestoes[0];
    if (titulo) novosTitulos.push(titulo);
  }

  await prisma.$transaction(
    novosTitulos.map((titulo, index) => {
      const previstoPara = new Date(previstoBase.getTime() + (index + startOffset) * line.intervaloMin * 60_000);
      return prisma.titleQueueItem.create({ data: { lineId, titulo, previstoPara, status: "NA_FILA" } });
    })
  );
}
