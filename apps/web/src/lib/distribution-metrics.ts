import "server-only";
import { prisma } from "@wordbee/db";
import { hojeIsoDate, toDataPrevista } from "@/lib/distribution";

/**
 * Métricas do painel de distribuição.
 *
 * Tudo aqui é leitura. O painel existe para responder uma pergunta prática:
 * **quais parcerias de grupo realmente convertem** — sem isso, pagar por
 * acesso a grupo vira aposta. Por isso os cliques são agrupados por grupo e
 * por perfil, não só somados.
 */

/** Janela dos números do painel. 7 dias é curto o bastante para refletir o presente. */
export const JANELA_DIAS = 7;

export interface ResumoPagina {
  id: string;
  nome: string;
  statusValidacao: boolean;
  publicados: number;
  falhas: number;
  aguardando: number;
  ultimoErro: string | null;
}

export interface ResumoCliques {
  id: string;
  nome: string;
  cliques: number;
  links: number;
}

export interface ResumoFilaDia {
  pendentes: number;
  postados: number;
  pulados: number;
  total: number;
}

export interface Projecao {
  pacotesPorDia: number;
  perfisAtivos: number;
  gruposPorPerfil: number;
  possiveisPorDia: number;
  realizadasPorDia: number;
  /** Fração do potencial que virou postagem de fato (null quando não há potencial). */
  aproveitamento: number | null;
}

export interface MetricasDistribuicao {
  paginas: ResumoPagina[];
  totalPublicadoPaginas: number;
  totalFalhasPaginas: number;
  filaHoje: ResumoFilaDia;
  cliquesPorGrupo: ResumoCliques[];
  cliquesPorPerfil: ResumoCliques[];
  cliquesTotais: number;
  projecao: Projecao;
  pacotesProntos: number;
  pacotesPendentes: number;
}

/**
 * A "fórmula" da Aula 3 (posts/dia × perfis × grupos por perfil), como
 * **informação de planejamento, não promessa**: ela descreve o teto que a
 * estrutura atual comporta, não o que vai acontecer. Por isso o painel
 * mostra sempre o realizado ao lado — o número sozinho seria enganoso.
 *
 * Função pura, separada da consulta, para que a aritmética (inclusive os
 * casos de divisão por zero) seja testável sem banco.
 */
export function calcularProjecao(entrada: {
  pacotesPorDia: number;
  perfisAtivos: number;
  gruposPorPerfil: number;
  realizadasPorDia: number;
}): Projecao {
  const possiveisPorDia = Math.round(entrada.pacotesPorDia * entrada.perfisAtivos * entrada.gruposPorPerfil);
  return {
    pacotesPorDia: arredondar(entrada.pacotesPorDia),
    perfisAtivos: entrada.perfisAtivos,
    gruposPorPerfil: arredondar(entrada.gruposPorPerfil),
    possiveisPorDia,
    realizadasPorDia: arredondar(entrada.realizadasPorDia),
    aproveitamento: possiveisPorDia > 0 ? entrada.realizadasPorDia / possiveisPorDia : null,
  };
}

function arredondar(valor: number): number {
  return Math.round(valor * 10) / 10;
}

export async function carregarMetricasDistribuicao(userId: string): Promise<MetricasDistribuicao> {
  const desde = new Date(Date.now() - JANELA_DIAS * 24 * 60 * 60 * 1000);
  const hoje = toDataPrevista(hojeIsoDate());

  const [publicacoes, itensHoje, links, perfis, grupos, pacotesProntos, pacotesPendentes, perfisAtivos, vinculosValidos, postadosJanela] =
    await Promise.all([
      prisma.pageDistributionPost.findMany({
        where: { package: { userId }, createdAt: { gte: desde } },
        select: {
          status: true,
          erroMsg: true,
          updatedAt: true,
          page: { select: { id: true, nome: true, statusValidacao: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.filaDistribuicaoManual.findMany({
        where: { userId, dataPrevista: hoje },
        select: { status: true },
      }),
      prisma.distributionLink.findMany({
        where: { userId },
        select: { cliqueCount: true, divulgacaoPerfilId: true, grupoParceiroId: true },
      }),
      prisma.divulgacaoPerfil.findMany({ where: { userId }, select: { id: true, nome: true } }),
      prisma.grupoParceiro.findMany({ where: { userId }, select: { id: true, nome: true } }),
      prisma.distributionPackage.count({ where: { userId, status: "PRONTO", createdAt: { gte: desde } } }),
      prisma.distributionPackage.count({ where: { userId, status: "PENDENTE" } }),
      prisma.divulgacaoPerfil.count({ where: { userId, ativo: true } }),
      // Só combinações que podem virar tarefa de verdade: pessoa dentro do
      // grupo, perfil ativo e parceria ativa. Contar vínculo "aguardando
      // aprovação" inflaria a projeção com capacidade que não existe.
      prisma.perfilGrupo.count({
        where: {
          status: { in: ["APROVADO", "ENTROU"] },
          perfil: { userId, ativo: true },
          grupo: { userId, status: "ATIVO" },
        },
      }),
      prisma.filaDistribuicaoManual.count({ where: { userId, status: "POSTADO", postadoEm: { gte: desde } } }),
    ]);

  // --- Páginas do Facebook (trilho automático) ---
  const porPagina = new Map<string, ResumoPagina>();
  for (const pub of publicacoes) {
    const atual =
      porPagina.get(pub.page.id) ??
      {
        id: pub.page.id,
        nome: pub.page.nome,
        statusValidacao: pub.page.statusValidacao,
        publicados: 0,
        falhas: 0,
        aguardando: 0,
        ultimoErro: null,
      };
    if (pub.status === "PUBLICADO") atual.publicados++;
    else if (pub.status === "FALHA") {
      atual.falhas++;
      // `publicacoes` vem ordenado por updatedAt desc, então o primeiro erro
      // encontrado por Página é o mais recente.
      if (!atual.ultimoErro) atual.ultimoErro = pub.erroMsg;
    } else atual.aguardando++;
    porPagina.set(pub.page.id, atual);
  }
  const paginas = [...porPagina.values()].sort((a, b) => b.publicados - a.publicados || a.nome.localeCompare(b.nome));

  // --- Fila manual de hoje ---
  const filaHoje: ResumoFilaDia = {
    pendentes: itensHoje.filter((i) => i.status === "PENDENTE").length,
    postados: itensHoje.filter((i) => i.status === "POSTADO").length,
    pulados: itensHoje.filter((i) => i.status === "PULADO").length,
    total: itensHoje.length,
  };

  // --- Cliques por grupo e por perfil ---
  const nomePerfil = new Map(perfis.map((p) => [p.id, p.nome]));
  const nomeGrupo = new Map(grupos.map((g) => [g.id, g.nome]));

  const cliquesPorGrupo = agruparCliques(links, (l) => l.grupoParceiroId, nomeGrupo, "Sem grupo");
  const cliquesPorPerfil = agruparCliques(links, (l) => l.divulgacaoPerfilId, nomePerfil, "Sem perfil");
  const cliquesTotais = links.reduce((soma, l) => soma + l.cliqueCount, 0);

  return {
    paginas,
    totalPublicadoPaginas: paginas.reduce((s, p) => s + p.publicados, 0),
    totalFalhasPaginas: paginas.reduce((s, p) => s + p.falhas, 0),
    filaHoje,
    cliquesPorGrupo,
    cliquesPorPerfil,
    cliquesTotais,
    pacotesProntos,
    pacotesPendentes,
    projecao: calcularProjecao({
      pacotesPorDia: pacotesProntos / JANELA_DIAS,
      perfisAtivos,
      gruposPorPerfil: perfisAtivos > 0 ? vinculosValidos / perfisAtivos : 0,
      realizadasPorDia: postadosJanela / JANELA_DIAS,
    }),
  };
}

function agruparCliques(
  links: Array<{ cliqueCount: number; divulgacaoPerfilId: string | null; grupoParceiroId: string | null }>,
  chave: (l: { divulgacaoPerfilId: string | null; grupoParceiroId: string | null }) => string | null,
  nomes: Map<string, string>,
  rotuloSemChave: string
): ResumoCliques[] {
  const mapa = new Map<string, ResumoCliques>();
  for (const link of links) {
    const id = chave(link) ?? "__sem__";
    const atual = mapa.get(id) ?? { id, nome: nomes.get(id) ?? rotuloSemChave, cliques: 0, links: 0 };
    atual.cliques += link.cliqueCount;
    atual.links++;
    mapa.set(id, atual);
  }
  // Mais cliques primeiro: a pergunta que o painel responde é "qual parceria
  // converte", então a ordem por volume é a leitura útil.
  return [...mapa.values()].sort((a, b) => b.cliques - a.cliques || a.nome.localeCompare(b.nome));
}
