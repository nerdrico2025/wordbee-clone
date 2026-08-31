/**
 * Tipos client-safe da distribuição — duplicados fora de `@wordbee/shared`
 * de propósito, mesmo motivo já registrado em DECISIONS.md (o barrel do
 * pacote reexporta módulos que usam `node:crypto`/`undici`, que não devem
 * vazar para o bundle do browser).
 */

export type GrupoParceiroStatusValue = "ATIVO" | "PAUSADO" | "ENCERRADO";
export type PerfilGrupoStatusValue = "AGUARDANDO_APROVACAO" | "APROVADO" | "ENTROU" | "REMOVIDO";
export type FilaStatusValue = "PENDENTE" | "POSTADO" | "PULADO";
export type PacoteTipoValue = "CAPTACAO" | "DIRETO_SITE";
export type PacoteStatusValue = "PENDENTE" | "PRONTO" | "FALHA";

export interface DivulgacaoPerfilSummary {
  id: string;
  nome: string;
  observacoes: string | null;
  ativo: boolean;
  gruposCount: number;
}

export interface GrupoParceiroSummary {
  id: string;
  nome: string;
  link: string;
  adminContato: string | null;
  valorPagoCentavos: number;
  periodoInicio: string;
  periodoFim: string | null;
  confirmaDivulgacaoParceria: boolean;
  membrosAprox: number | null;
  status: GrupoParceiroStatusValue;
  perfis: PerfilNoGrupo[];
}

export interface PerfilNoGrupo {
  id: string;
  perfilId: string;
  perfilNome: string;
  status: PerfilGrupoStatusValue;
  dataEntrada: string | null;
}

export interface CopyVariacao {
  copyDescricao: string;
  copyComentario: string;
  palavraChave: string;
}

export interface PacoteSummary {
  id: string;
  tipo: PacoteTipoValue;
  status: PacoteStatusValue;
  imagens: string[];
  copyDescricao: string | null;
  copyComentario: string | null;
  linkDestino: string | null;
  variacoes: CopyVariacao[];
  erroMsg: string | null;
  createdAt: string;
  artigo: { id: string; titulo: string; tema: string | null; siteNome: string; wpUrl: string | null } | null;
  filaCount: number;
  paginasCount: number;
  cliquesTotais: number;
}

export interface ArtigoDisponivel {
  id: string;
  titulo: string;
  tema: string | null;
  siteNome: string;
  publishedAt: string | null;
  /** Quantos artigos publicados o blog já tem sobre este mesmo tema. */
  artigosNoTema: number;
  /** Se DIRETO_SITE é recomendado (o tema já tem conteúdo suficiente). */
  diretoSiteRecomendado: boolean;
  tiposJaCriados: PacoteTipoValue[];
}

export interface FilaItemSummary {
  id: string;
  status: FilaStatusValue;
  dataPrevista: string;
  postadoEm: string | null;
  observacao: string | null;
  perfil: { id: string; nome: string };
  grupo: { id: string; nome: string; link: string };
  pacote: {
    id: string;
    tipo: PacoteTipoValue;
    imagens: string[];
    copyDescricao: string | null;
    artigoTitulo: string | null;
  };
  /** Copy de comentário já com o link curto rastreado desta combinação. */
  copyComentario: string;
  linkRastreado: string | null;
  cliques: number;
}

export interface OpcaoCombinacao {
  perfilId: string;
  perfilNome: string;
  grupoId: string;
  grupoNome: string;
}

/** Quantos artigos no mesmo tema o blog precisa ter para DIRETO_SITE ser recomendado. */
export const MIN_ARTIGOS_DIRETO_SITE = 3;

/** Máximo de imagens de um pacote (formato álbum). Espelha MAX_IMAGENS_PACOTE de @wordbee/shared. */
export const MAX_IMAGENS_PACOTE_UI = 6;

export function formatarCentavos(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export const GRUPO_STATUS_LABEL: Record<GrupoParceiroStatusValue, string> = {
  ATIVO: "Ativo",
  PAUSADO: "Pausado",
  ENCERRADO: "Encerrado",
};

export const PERFIL_GRUPO_STATUS_LABEL: Record<PerfilGrupoStatusValue, string> = {
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  APROVADO: "Aprovado",
  ENTROU: "Já está no grupo",
  REMOVIDO: "Removido",
};

export const FILA_STATUS_LABEL: Record<FilaStatusValue, string> = {
  PENDENTE: "Pendente",
  POSTADO: "Postado",
  PULADO: "Pulado",
};

export const PACOTE_TIPO_LABEL: Record<PacoteTipoValue, string> = {
  CAPTACAO: "Captação (leva ao artigo)",
  DIRETO_SITE: "Direto pro site (leva à busca do blog)",
};

/** Só quem já está dentro do grupo pode receber tarefa de postar nele. */
export function podeEntrarNaFila(status: PerfilGrupoStatusValue): boolean {
  return status === "APROVADO" || status === "ENTROU";
}
