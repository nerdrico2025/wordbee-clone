import "server-only";
import { Prisma } from "@wordbee/db";
import type { GrupoParceiroSummary } from "@/lib/distribution-types";

/**
 * Leitura padrão de um grupo parceiro que chega ao frontend. Inclui os
 * perfis vinculados porque as duas telas que mostram grupo (Grupos
 * Parceiros e a seleção de combinações ao distribuir um pacote) precisam
 * saber quem já está dentro do grupo.
 */
export const GRUPO_INCLUDE = {
  perfis: {
    include: { perfil: { select: { id: true, nome: true } } },
    orderBy: { perfil: { nome: "asc" } },
  },
} satisfies Prisma.GrupoParceiroInclude;

export type GrupoParceiroRow = Prisma.GrupoParceiroGetPayload<{ include: typeof GRUPO_INCLUDE }>;

export function toGrupoSummary(grupo: GrupoParceiroRow): GrupoParceiroSummary {
  return {
    id: grupo.id,
    nome: grupo.nome,
    link: grupo.link,
    adminContato: grupo.adminContato,
    valorPagoCentavos: grupo.valorPagoCentavos,
    periodoInicio: grupo.periodoInicio.toISOString().slice(0, 10),
    periodoFim: grupo.periodoFim ? grupo.periodoFim.toISOString().slice(0, 10) : null,
    confirmaDivulgacaoParceria: grupo.confirmaDivulgacaoParceria,
    membrosAprox: grupo.membrosAprox,
    status: grupo.status,
    perfis: grupo.perfis.map((v) => ({
      id: v.id,
      perfilId: v.divulgacaoPerfilId,
      perfilNome: v.perfil.nome,
      status: v.status,
      dataEntrada: v.dataEntrada ? v.dataEntrada.toISOString().slice(0, 10) : null,
    })),
  };
}
