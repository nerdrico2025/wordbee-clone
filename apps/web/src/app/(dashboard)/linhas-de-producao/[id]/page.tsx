import { notFound, redirect } from "next/navigation";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { LineDetailClient } from "@/components/production-lines/LineDetailClient";

export default async function LineDetailPage({ params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const line = await prisma.productionLine.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: {
      wpSite: { select: { nome: true } },
      referenceImages: { orderBy: { ordem: "asc" } },
      titleQueue: { where: { status: "NA_FILA" }, orderBy: { previstoPara: "asc" } },
      articles: { where: { status: { in: ["PUBLICADO", "RASCUNHO"] } }, orderBy: { publishedAt: "desc" }, take: 50 },
    },
  });
  if (!line) notFound();

  return (
    <LineDetailClient
      initial={{
        id: line.id,
        nome: line.nome,
        status: line.status,
        wpSite: line.wpSite,
        wpSiteId: line.wpSiteId,
        categoriaWpId: line.categoriaWpId,
        categoriaWpNome: line.categoriaWpNome,
        iaTexto: line.iaTexto,
        iaImagem: line.iaImagem,
        tipoArtigo: line.tipoArtigo,
        temas: line.temas,
        intervaloMin: line.intervaloMin,
        maxArtigos: line.maxArtigos,
        geradosCount: line.geradosCount,
        statusWp: line.statusWp,
        promptCustomizado: line.promptCustomizado,
        rateLimitBehavior: line.rateLimitBehavior,
        consecutiveFailures: line.consecutiveFailures,
        lastRunAt: line.lastRunAt?.toISOString() ?? null,
        nextRunAt: line.nextRunAt?.toISOString() ?? null,
        pauseReason: line.pauseReason,
        referenceImages: line.referenceImages,
        titleQueue: line.titleQueue.map((t) => ({ ...t, previstoPara: t.previstoPara.toISOString() })),
        articles: line.articles.map((a) => ({
          id: a.id,
          titulo: a.titulo,
          status: a.status,
          wpUrl: a.wpUrl,
          publishedAt: a.publishedAt?.toISOString() ?? null,
        })),
      }}
    />
  );
}
