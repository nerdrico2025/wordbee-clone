import { redirect } from "next/navigation";
import { Prisma, prisma } from "@wordbee/db";
import type { ArticleStatus } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { HistoricoClient } from "@/components/historico/HistoricoClient";

const PAGE_SIZE = 20;

export default async function HistoricoPage({
  searchParams,
}: {
  searchParams: { site?: string; status?: string; linha?: string; de?: string; ate?: string; busca?: string; page?: string };
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const userId = session.user.id;

  const page = Math.max(1, Number(searchParams.page ?? "1") || 1);

  const where: Prisma.ArticleWhereInput = { userId };
  if (searchParams.site) where.wpSiteId = searchParams.site;
  if (searchParams.status) where.status = searchParams.status as ArticleStatus;
  if (searchParams.linha === "manual") where.origem = "MANUAL";
  else if (searchParams.linha) where.lineId = searchParams.linha;
  if (searchParams.busca) where.titulo = { contains: searchParams.busca, mode: "insensitive" };
  if (searchParams.de || searchParams.ate) {
    where.createdAt = {};
    if (searchParams.de) where.createdAt.gte = new Date(searchParams.de);
    if (searchParams.ate) where.createdAt.lte = new Date(`${searchParams.ate}T23:59:59`);
  }

  const [articles, total, sites, lines] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { wpSite: { select: { nome: true } }, line: { select: { nome: true } } },
    }),
    prisma.article.count({ where }),
    prisma.wpSite.findMany({ where: { userId }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.productionLine.findMany({ where: { userId }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);

  return (
    <HistoricoClient
      articles={articles.map((a) => ({
        id: a.id,
        titulo: a.titulo,
        tipo: a.tipo,
        status: a.status,
        origem: a.origem,
        lineNome: a.line?.nome ?? null,
        siteNome: a.wpSite.nome,
        wpUrl: a.wpUrl,
        erroMsg: a.erroMsg,
        createdAt: a.createdAt.toISOString(),
      }))}
      total={total}
      page={page}
      pageSize={PAGE_SIZE}
      sites={sites}
      lines={lines}
      filters={searchParams}
    />
  );
}
