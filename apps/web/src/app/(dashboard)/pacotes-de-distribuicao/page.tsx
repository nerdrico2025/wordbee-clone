import { redirect } from "next/navigation";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { contarArtigosNoTema, diretoSiteRecomendado, hojeIsoDate, lerVariacoes } from "@/lib/distribution";
import { GRUPO_INCLUDE, toGrupoSummary } from "@/lib/grupos-parceiros";
import { PacotesClient } from "@/components/distribuicao/PacotesClient";
import type { ArtigoDisponivel, PacoteSummary } from "@/lib/distribution-types";

/** Quantos artigos publicados recentes oferecer para criar pacote manualmente. */
const ARTIGOS_DISPONIVEIS = 25;

export default async function PacotesDeDistribuicaoPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const userId = session.user.id;

  const [pacotes, artigos, perfis, grupos] = await Promise.all([
    prisma.distributionPackage.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        article: { select: { id: true, titulo: true, tema: true, wpUrl: true, wpSite: { select: { nome: true } } } },
        links: { select: { cliqueCount: true } },
        _count: { select: { filaItens: true, pagePosts: true } },
      },
    }),
    prisma.article.findMany({
      where: { userId, status: "PUBLICADO", wpUrl: { not: null } },
      orderBy: { publishedAt: "desc" },
      take: ARTIGOS_DISPONIVEIS,
      select: {
        id: true,
        titulo: true,
        tema: true,
        wpSiteId: true,
        publishedAt: true,
        wpSite: { select: { nome: true } },
        distributionPackages: { select: { tipo: true } },
      },
    }),
    prisma.divulgacaoPerfil.findMany({
      where: { userId, ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, ativo: true },
    }),
    prisma.grupoParceiro.findMany({
      where: { userId, status: "ATIVO" },
      orderBy: { nome: "asc" },
      include: GRUPO_INCLUDE,
    }),
  ]);

  // A contagem de artigos por tema é o que decide se DIRETO_SITE é
  // recomendado. Temas repetem bastante entre os artigos recentes, então
  // vale deduplicar antes de consultar (uma query por tema distinto, não
  // uma por artigo).
  const chavesTema = new Map<string, { wpSiteId: string; tema: string | null }>();
  for (const artigo of artigos) {
    chavesTema.set(`${artigo.wpSiteId}::${artigo.tema ?? ""}`, { wpSiteId: artigo.wpSiteId, tema: artigo.tema });
  }
  const contagens = new Map<string, number>();
  await Promise.all(
    [...chavesTema.entries()].map(async ([chave, { wpSiteId, tema }]) => {
      contagens.set(chave, await contarArtigosNoTema(userId, wpSiteId, tema));
    })
  );

  const artigosDisponiveis: ArtigoDisponivel[] = artigos.map((artigo) => {
    const artigosNoTema = contagens.get(`${artigo.wpSiteId}::${artigo.tema ?? ""}`) ?? 0;
    return {
      id: artigo.id,
      titulo: artigo.titulo,
      tema: artigo.tema,
      siteNome: artigo.wpSite.nome,
      publishedAt: artigo.publishedAt?.toISOString() ?? null,
      artigosNoTema,
      diretoSiteRecomendado: diretoSiteRecomendado(artigosNoTema),
      tiposJaCriados: artigo.distributionPackages.map((p) => p.tipo),
    };
  });

  const pacotesResumo: PacoteSummary[] = pacotes.map((p) => ({
    id: p.id,
    tipo: p.tipo,
    status: p.status,
    imagens: p.imagens,
    copyDescricao: p.copyDescricao,
    copyComentario: p.copyComentario,
    linkDestino: p.linkDestino,
    variacoes: lerVariacoes(p.copyVariacoes),
    erroMsg: p.erroMsg,
    createdAt: p.createdAt.toISOString(),
    artigo: p.article
      ? {
          id: p.article.id,
          titulo: p.article.titulo,
          tema: p.article.tema,
          siteNome: p.article.wpSite.nome,
          wpUrl: p.article.wpUrl,
        }
      : null,
    filaCount: p._count.filaItens,
    paginasCount: p._count.pagePosts,
    cliquesTotais: p.links.reduce((soma, l) => soma + l.cliqueCount, 0),
  }));

  return (
    <PacotesClient
      pacotes={pacotesResumo}
      artigos={artigosDisponiveis}
      perfis={perfis}
      grupos={grupos.map(toGrupoSummary)}
      hoje={hojeIsoDate()}
    />
  );
}
