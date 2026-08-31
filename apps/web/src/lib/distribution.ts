import "server-only";
import { headers } from "next/headers";
import { Prisma, prisma } from "@wordbee/db";
import { buildTrackedUrl, generateShortCode, trocarLinkDaCopy } from "@wordbee/shared";
import type { CopyVariacao } from "@/lib/distribution-types";
import { MIN_ARTIGOS_DIRETO_SITE } from "@/lib/distribution-types";

/**
 * Regras de servidor do trilho ASSISTIDO da distribuição.
 *
 * Tudo aqui é organização de trabalho humano: montar a fila do dia, gerar o
 * link rastreado de cada combinação e registrar o que a pessoa já fez.
 * Nenhuma função deste arquivo publica, agenda publicação ou age em nome de
 * uma conta pessoal — e nenhuma deve passar a fazer isso. Ver DECISIONS.md,
 * "Limite de escopo permanente".
 */

// ---------------------------------------------------------------------------
// Datas: a fila trabalha em DIA de calendário, não em instante
// ---------------------------------------------------------------------------

/**
 * Fuso usado para decidir "que dia é hoje" na fila.
 *
 * Sem isto, o servidor (UTC) viraria o dia às 21h no horário de Brasília e a
 * fila do dia mudaria embaixo de quem ainda está trabalhando à noite. O
 * `Intl` com `timeZone` explícito dá a data local certa independentemente do
 * fuso do servidor — que é justamente o tipo de suposição implícita que já
 * causou um bug real no lock do scheduler (ver DECISIONS.md).
 */
const APP_TIMEZONE = process.env.APP_TIMEZONE || "America/Sao_Paulo";

/** Data de hoje (YYYY-MM-DD) no fuso do usuário, não no fuso do servidor. */
export function hojeIsoDate(agora: Date = new Date(), timeZone: string = APP_TIMEZONE): string {
  // en-CA formata como YYYY-MM-DD, que é exatamente o formato que o
  // <input type="date"> e a query string usam.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/**
 * Converte "YYYY-MM-DD" no `DateTime` gravado no banco: meia-noite UTC.
 * É um rótulo de dia, não um instante — por isso sempre UTC, nunca o fuso
 * local (que faria a mesma data virar valores diferentes conforme o
 * horário de verão).
 */
export function toDataPrevista(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T00:00:00.000Z`);
}

/** Inverso de `toDataPrevista`. */
export function fromDataPrevista(data: Date): string {
  return data.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// URL pública do app (base dos links rastreados)
// ---------------------------------------------------------------------------

/**
 * Base para montar `/r/{code}`.
 *
 * `APP_PUBLIC_URL` tem prioridade (é o valor certo e estável em produção);
 * sem ela, deriva dos headers da requisição, o que faz os links funcionarem
 * em `localhost:3000` sem configurar nada.
 */
export function resolveAppBaseUrl(): string {
  const fromEnv = process.env.APP_PUBLIC_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// ---------------------------------------------------------------------------
// Regra do tipo de pacote (conceito da Aula 4)
// ---------------------------------------------------------------------------

/**
 * Quantos artigos publicados o blog já tem sobre o mesmo tema.
 *
 * É o número que decide se DIRETO_SITE (mandar para a página de busca do
 * blog) faz sentido: mandar tráfego para uma busca com um artigo só entrega
 * uma página quase vazia. Comparação case-insensitive porque "Doce de
 * leite" e "doce de leite" são o mesmo tema para quem escreve.
 */
export async function contarArtigosNoTema(userId: string, wpSiteId: string, tema: string | null): Promise<number> {
  if (!tema?.trim()) return 0;
  return prisma.article.count({
    where: { userId, wpSiteId, status: "PUBLICADO", tema: { equals: tema.trim(), mode: "insensitive" } },
  });
}

export function diretoSiteRecomendado(artigosNoTema: number): boolean {
  return artigosNoTema >= MIN_ARTIGOS_DIRETO_SITE;
}

// ---------------------------------------------------------------------------
// Variações de copy
// ---------------------------------------------------------------------------

/** Lê com segurança o Json de variações (que pode ser null ou lixo antigo). */
export function lerVariacoes(raw: Prisma.JsonValue | null): CopyVariacao[] {
  if (!Array.isArray(raw)) return [];
  const variacoes: CopyVariacao[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj.copyDescricao !== "string" || typeof obj.copyComentario !== "string") continue;
    variacoes.push({
      copyDescricao: obj.copyDescricao,
      copyComentario: obj.copyComentario,
      palavraChave: typeof obj.palavraChave === "string" ? obj.palavraChave : "QUERO",
    });
  }
  return variacoes;
}

/**
 * Troca a variação ativa de um pacote.
 *
 * As variações são guardadas CRUAS (sem link) — trocar é copiar a escolhida
 * para os campos ativos reanexando `linkDestino`. Guardar já com o link
 * obrigaria a reescrever todas as variações se o destino mudasse.
 */
export async function aplicarVariacaoDeCopy(userId: string, packageId: string, indice: number): Promise<void> {
  const pacote = await prisma.distributionPackage.findFirst({ where: { id: packageId, userId } });
  if (!pacote) throw new Error("Pacote não encontrado.");

  const variacoes = lerVariacoes(pacote.copyVariacoes);
  const escolhida = variacoes[indice];
  if (!escolhida) throw new Error("Variação de copy não encontrada.");

  await prisma.distributionPackage.update({
    where: { id: packageId },
    data: {
      copyDescricao: escolhida.copyDescricao,
      copyComentario: pacote.linkDestino ? `${escolhida.copyComentario}\n\n${pacote.linkDestino}` : escolhida.copyComentario,
    },
  });
}

// ---------------------------------------------------------------------------
// Links rastreados
// ---------------------------------------------------------------------------

/**
 * Devolve o link rastreado da combinação pacote × perfil × grupo, criando-o
 * se ainda não existir.
 *
 * A combinação reusa sempre o mesmo código (garantido pela unique no
 * schema) — senão os cliques de um mesmo grupo/perfil ficariam espalhados
 * por vários links a cada vez que o pacote voltasse para a fila, e a
 * métrica de "qual parceria converte" perderia o sentido.
 */
export async function obterOuCriarLink(input: {
  userId: string;
  packageId: string;
  divulgacaoPerfilId: string;
  grupoParceiroId: string;
  destinoUrl: string;
}) {
  const existente = await prisma.distributionLink.findFirst({
    where: {
      packageId: input.packageId,
      divulgacaoPerfilId: input.divulgacaoPerfilId,
      grupoParceiroId: input.grupoParceiroId,
    },
  });
  if (existente) return existente;

  // Colisão de `code` é desprezível (56^8), mas a unique é quem garante de
  // verdade — então a criação tenta de novo com outro código em vez de
  // estourar um erro que o usuário não pode resolver.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    try {
      return await prisma.distributionLink.create({
        data: {
          userId: input.userId,
          packageId: input.packageId,
          divulgacaoPerfilId: input.divulgacaoPerfilId,
          grupoParceiroId: input.grupoParceiroId,
          destinoUrl: input.destinoUrl,
          code: generateShortCode(),
        },
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") throw err;
      // Pode ser colisão de `code` OU outra requisição concorrente que já
      // criou a mesma combinação. Se for o segundo caso, o link já existe:
      // devolve o dele em vez de tentar de novo para sempre.
      const concorrente = await prisma.distributionLink.findFirst({
        where: {
          packageId: input.packageId,
          divulgacaoPerfilId: input.divulgacaoPerfilId,
          grupoParceiroId: input.grupoParceiroId,
        },
      });
      if (concorrente) return concorrente;
    }
  }
  throw new Error("Não foi possível gerar um código de link único. Tente de novo.");
}

/** Copy de comentário de um item da fila, com o link curto no lugar do destino direto. */
export function copyComentarioComLinkCurto(
  copyComentario: string | null,
  linkDestino: string | null,
  baseUrl: string,
  code: string | null
): string {
  if (!copyComentario) return "";
  if (!code) return copyComentario;
  return trocarLinkDaCopy(copyComentario, linkDestino, buildTrackedUrl(baseUrl, code));
}

// ---------------------------------------------------------------------------
// Fila de distribuição manual
// ---------------------------------------------------------------------------

export interface CombinacaoEntrada {
  divulgacaoPerfilId: string;
  grupoParceiroId: string;
}

export interface ResultadoEnfileiramento {
  criados: number;
  ignorados: Array<{ perfilNome: string; grupoNome: string; motivo: string }>;
}

/**
 * Coloca combinações perfil × grupo na fila de um dia.
 *
 * Regras aplicadas (todas com motivo devolvido ao usuário, em vez de falhar
 * a requisição inteira por causa de uma combinação inválida):
 *  - o perfil precisa estar ativo e o grupo com parceria ATIVA;
 *  - o perfil precisa já estar dentro do grupo (APROVADO/ENTROU) — não dá
 *    para pedir que alguém poste num grupo de que não participa;
 *  - o mesmo perfil não repete no mesmo grupo no mesmo dia (para não
 *    parecer spam). Essa última é garantida pela unique do banco, não só
 *    por esta checagem — uma requisição concorrente não fura a regra.
 */
export async function enfileirarCombinacoes(
  userId: string,
  packageId: string,
  combinacoes: CombinacaoEntrada[],
  dataPrevista: Date
): Promise<ResultadoEnfileiramento> {
  const pacote = await prisma.distributionPackage.findFirst({ where: { id: packageId, userId } });
  if (!pacote) throw new Error("Pacote não encontrado.");
  if (pacote.status !== "PRONTO") throw new Error("O pacote ainda não está pronto para ser distribuído.");
  if (!pacote.linkDestino) throw new Error("O pacote não tem link de destino.");

  const perfilIds = [...new Set(combinacoes.map((c) => c.divulgacaoPerfilId))];
  const grupoIds = [...new Set(combinacoes.map((c) => c.grupoParceiroId))];

  const [perfis, grupos, vinculos] = await Promise.all([
    prisma.divulgacaoPerfil.findMany({ where: { id: { in: perfilIds }, userId } }),
    prisma.grupoParceiro.findMany({ where: { id: { in: grupoIds }, userId } }),
    prisma.perfilGrupo.findMany({
      where: { divulgacaoPerfilId: { in: perfilIds }, grupoParceiroId: { in: grupoIds } },
    }),
  ]);

  const perfilPorId = new Map(perfis.map((p) => [p.id, p]));
  const grupoPorId = new Map(grupos.map((g) => [g.id, g]));
  const vinculoPorChave = new Map(vinculos.map((v) => [`${v.divulgacaoPerfilId}:${v.grupoParceiroId}`, v]));

  const resultado: ResultadoEnfileiramento = { criados: 0, ignorados: [] };

  for (const combo of combinacoes) {
    const perfil = perfilPorId.get(combo.divulgacaoPerfilId);
    const grupo = grupoPorId.get(combo.grupoParceiroId);
    const perfilNome = perfil?.nome ?? "Perfil desconhecido";
    const grupoNome = grupo?.nome ?? "Grupo desconhecido";

    if (!perfil || !grupo) {
      resultado.ignorados.push({ perfilNome, grupoNome, motivo: "Perfil ou grupo não encontrado." });
      continue;
    }
    if (!perfil.ativo) {
      resultado.ignorados.push({ perfilNome, grupoNome, motivo: "Perfil está inativo." });
      continue;
    }
    if (grupo.status !== "ATIVO") {
      resultado.ignorados.push({ perfilNome, grupoNome, motivo: "A parceria com este grupo não está ativa." });
      continue;
    }

    const vinculo = vinculoPorChave.get(`${combo.divulgacaoPerfilId}:${combo.grupoParceiroId}`);
    if (!vinculo || (vinculo.status !== "APROVADO" && vinculo.status !== "ENTROU")) {
      resultado.ignorados.push({ perfilNome, grupoNome, motivo: "Este perfil ainda não está dentro do grupo." });
      continue;
    }

    try {
      await prisma.filaDistribuicaoManual.create({
        data: {
          userId,
          packageId,
          divulgacaoPerfilId: combo.divulgacaoPerfilId,
          grupoParceiroId: combo.grupoParceiroId,
          dataPrevista,
        },
      });
      // O link da combinação nasce junto com o item da fila — é ele que
      // aparece na copy do comentário que a pessoa vai colar.
      await obterOuCriarLink({
        userId,
        packageId,
        divulgacaoPerfilId: combo.divulgacaoPerfilId,
        grupoParceiroId: combo.grupoParceiroId,
        destinoUrl: pacote.linkDestino,
      });
      resultado.criados++;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        resultado.ignorados.push({
          perfilNome,
          grupoNome,
          motivo: "Este perfil já tem uma postagem marcada nesse grupo nesse dia.",
        });
        continue;
      }
      throw err;
    }
  }

  return resultado;
}
