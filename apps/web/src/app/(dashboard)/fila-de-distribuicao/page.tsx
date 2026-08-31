import { redirect } from "next/navigation";
import { Prisma, prisma } from "@wordbee/db";
import type { FilaDistribuicaoStatus } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { copyComentarioComLinkCurto, fromDataPrevista, hojeIsoDate, resolveAppBaseUrl, toDataPrevista } from "@/lib/distribution";
import { FilaClient } from "@/components/distribuicao/FilaClient";
import type { FilaItemSummary } from "@/lib/distribution-types";
import { buildTrackedUrl } from "@wordbee/shared";

export default async function FilaDeDistribuicaoPage({
  searchParams,
}: {
  searchParams: { data?: string; perfil?: string; grupo?: string; status?: string };
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const userId = session.user.id;

  const hoje = hojeIsoDate();
  const dataSelecionada = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.data ?? "") ? searchParams.data! : hoje;

  const where: Prisma.FilaDistribuicaoManualWhereInput = {
    userId,
    dataPrevista: toDataPrevista(dataSelecionada),
  };
  if (searchParams.perfil) where.divulgacaoPerfilId = searchParams.perfil;
  if (searchParams.grupo) where.grupoParceiroId = searchParams.grupo;
  if (searchParams.status) where.status = searchParams.status as FilaDistribuicaoStatus;

  const [itens, perfis, grupos] = await Promise.all([
    prisma.filaDistribuicaoManual.findMany({
      where,
      orderBy: [{ perfil: { nome: "asc" } }, { grupo: { nome: "asc" } }],
      include: {
        perfil: { select: { id: true, nome: true } },
        grupo: { select: { id: true, nome: true, link: true } },
        package: {
          select: {
            id: true,
            tipo: true,
            imagens: true,
            copyDescricao: true,
            copyComentario: true,
            linkDestino: true,
            article: { select: { titulo: true } },
          },
        },
      },
    }),
    prisma.divulgacaoPerfil.findMany({ where: { userId }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.grupoParceiro.findMany({ where: { userId }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);

  // Os links rastreados de todas as combinações desta página, numa consulta
  // só (em vez de uma por item) — cada item precisa do código dele para
  // montar a copy do comentário que a pessoa vai colar.
  const links = itens.length
    ? await prisma.distributionLink.findMany({
        where: {
          userId,
          packageId: { in: [...new Set(itens.map((i) => i.packageId))] },
          divulgacaoPerfilId: { in: [...new Set(itens.map((i) => i.divulgacaoPerfilId))] },
          grupoParceiroId: { in: [...new Set(itens.map((i) => i.grupoParceiroId))] },
        },
        select: { packageId: true, divulgacaoPerfilId: true, grupoParceiroId: true, code: true, cliqueCount: true },
      })
    : [];
  const linkPorChave = new Map(
    links.map((l) => [`${l.packageId}:${l.divulgacaoPerfilId}:${l.grupoParceiroId}`, l])
  );

  const baseUrl = resolveAppBaseUrl();

  const resumo: FilaItemSummary[] = itens.map((item) => {
    const link = linkPorChave.get(`${item.packageId}:${item.divulgacaoPerfilId}:${item.grupoParceiroId}`);
    return {
      id: item.id,
      status: item.status,
      dataPrevista: fromDataPrevista(item.dataPrevista),
      postadoEm: item.postadoEm?.toISOString() ?? null,
      observacao: item.observacao,
      perfil: item.perfil,
      grupo: item.grupo,
      pacote: {
        id: item.package.id,
        tipo: item.package.tipo,
        imagens: item.package.imagens,
        copyDescricao: item.package.copyDescricao,
        artigoTitulo: item.package.article?.titulo ?? null,
      },
      copyComentario: copyComentarioComLinkCurto(
        item.package.copyComentario,
        item.package.linkDestino,
        baseUrl,
        link?.code ?? null
      ),
      linkRastreado: link ? buildTrackedUrl(baseUrl, link.code) : null,
      cliques: link?.cliqueCount ?? 0,
    };
  });

  return (
    <FilaClient
      itens={resumo}
      perfis={perfis}
      grupos={grupos}
      hoje={hoje}
      dataSelecionada={dataSelecionada}
      filtros={searchParams}
    />
  );
}
