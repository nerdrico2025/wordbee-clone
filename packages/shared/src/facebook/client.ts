import { fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";
import { FacebookError, classifyGraphError } from "./errors.js";

/**
 * Cliente da Graph API oficial da Meta — trilho AUTOMÁTICO da distribuição.
 *
 * Limite de escopo permanente (plano-acao-claude-code-distribuicao.md,
 * "Limite de escopo"; DECISIONS.md 2026-08-31): este módulo publica
 * exclusivamente em **Páginas**, com token de Página, pela API oficial.
 * Não existe — e não deve ser adicionado — nenhum caminho aqui para
 * publicar em Grupos ou em perfis pessoais: a API de Grupos foi
 * descontinuada pela Meta em 2024 e todo caminho não-oficial passa por
 * automação de sessão/navegador de conta pessoal, que este projeto rejeita
 * em definitivo (o risco de banimento recai sobre contas reais de pessoas
 * reais). Grupos e perfis pessoais são atendidos pelo trilho assistido —
 * o app organiza o trabalho, a publicação é um clique humano.
 *
 * Mesmo molde de `packages/shared/src/wordpress/client.ts`: `undici`
 * explícito (o `fetch` global do Next transforma respostas de erro HTTP em
 * exceções genéricas — ver DECISIONS.md 2026-08-24), timeout cobrindo o
 * fetch E a leitura do corpo, retry com backoff só para falhas
 * transitórias, e erros normalizados em `FacebookError` com mensagem em
 * português.
 */

const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || "v21.0";
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;
const USER_AGENT = "WordbeeClone/1.0 (+uso-pessoal)";
const DEFAULT_TIMEOUT_MS = 30_000;

export interface FacebookPageCredentials {
  /** ID numérico da Página na Meta. */
  pageId: string;
  accessToken: string;
}

export interface FacebookPageInfo {
  id: string;
  nome: string;
}

export interface PublishPhotoInput {
  /** Legenda do post (copy de descrição). */
  mensagem: string;
  /** URL pública da imagem — a Meta busca a imagem por conta própria. */
  imagemUrl: string;
}

export interface PublishLinkInput {
  mensagem: string;
  link: string;
}

export interface PublishedPost {
  /** ID do post no formato "{pageId}_{postId}", usado para comentar nele. */
  postId: string;
}

export interface PublishedComment {
  commentId: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Só falhas transitórias são retentadas aqui (rede/timeout/indisponibilidade
 * da Meta). Erros de token, permissão e rate limit NÃO são retentados neste
 * nível: repetir na mesma hora não muda o resultado e, no caso de rate
 * limit, só piora — quem trata isso é o pipeline do worker, reagendando a
 * publicação para mais tarde (mesma divisão de responsabilidade que o
 * `line-pipeline.ts` já usa para os provedores de IA).
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retryable =
        err instanceof FacebookError && (err.code === "network" || err.code === "timeout" || err.code === "unavailable");
      if (!retryable || attempt === attempts - 1) throw err;
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastError;
}

/**
 * Faz a requisição e já lê o corpo dentro da mesma janela de timeout.
 *
 * A promise de `fetch()` resolve quando os headers chegam; ler o corpo é
 * uma etapa separada. Cancelar o timer logo depois do `fetch()` deixaria a
 * leitura do corpo sem timeout nenhum — exatamente o bug de produção
 * corrigido em `packages/shared/src/ai/http.ts` em 2026-08-25 (geração de
 * artigo travava para sempre). O mesmo cuidado vale aqui.
 */
async function graphFetch(
  path: string,
  init: UndiciRequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<unknown> {
  const url = `${GRAPH_BASE_URL}${path}`;

  return withRetry(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let res: Response;
      try {
        res = (await undiciFetch(url, {
          ...init,
          headers: { "User-Agent": USER_AGENT, ...(init.headers ?? {}) },
          signal: controller.signal,
        })) as unknown as Response;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") throw new FacebookError("timeout");
        throw new FacebookError("network", err instanceof Error ? err.message : String(err));
      }

      const bodyText = await res.text().catch(() => "");
      if (!res.ok) throw classifyGraphError(res.status, bodyText);

      try {
        return JSON.parse(bodyText);
      } catch {
        throw new FacebookError("unknown", "resposta do Facebook não é um JSON válido");
      }
    } catch (err) {
      // Um abort disparado durante a LEITURA do corpo (não no fetch) chega
      // aqui como AbortError cru — sem este ramo viraria "unknown".
      if (err instanceof Error && err.name === "AbortError") throw new FacebookError("timeout");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  });
}

function formBody(params: Record<string, string>): UndiciRequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  };
}

/**
 * Valida o token e confirma que ele enxerga a Página informada (RF-15 do
 * PRD aplicado ao token de Página: nada é persistido antes de uma chamada
 * real bem-sucedida ao provedor).
 */
export async function validatePageToken(creds: FacebookPageCredentials): Promise<FacebookPageInfo> {
  // Token no header `Authorization`, NUNCA na query string — apesar de a
  // Graph API aceitar `?access_token=`, uma URL com o token dentro acaba em
  // log de proxy e, pior, pode ser embutida por bibliotecas na mensagem de
  // um erro de rede. Essa mensagem vira `facebook_pages.last_error` no banco
  // e linha de log no EasyPanel — ou seja, o token em texto puro exatamente
  // onde ele nunca pode estar. Com o header, nenhum caminho do código
  // coloca o token numa URL. Ver DECISIONS.md (PROMPT 3).
  const json = (await graphFetch(`/${encodeURIComponent(creds.pageId)}?fields=id,name`, {
    method: "GET",
    headers: { Authorization: `Bearer ${creds.accessToken}` },
  })) as { id?: string; name?: string };

  if (!json.id) throw new FacebookError("unknown", "resposta do Facebook sem o id da Página");
  return { id: json.id, nome: json.name ?? json.id };
}

/**
 * Publica um post com foto na Página (`POST /{page-id}/photos`).
 *
 * Usa `url` (URL pública da imagem) em vez de upload multipart: a imagem
 * destacada do artigo já está hospedada publicamente no próprio WordPress
 * depois da publicação, então a Meta busca de lá. Isso evita depender do
 * storage local do worker, que é o ponto frágil conhecido do projeto
 * (`STORAGE_DRIVER=local`, sem driver S3 — ver PROJECT-STATE.md §10).
 */
export async function publishPhotoPost(creds: FacebookPageCredentials, input: PublishPhotoInput): Promise<PublishedPost> {
  const json = (await graphFetch(
    `/${encodeURIComponent(creds.pageId)}/photos`,
    formBody({
      url: input.imagemUrl,
      caption: input.mensagem,
      published: "true",
      access_token: creds.accessToken,
    })
  )) as { post_id?: string; id?: string };

  // `/photos` devolve `id` (da foto) e `post_id` (do post no feed). É o
  // `post_id` que aceita comentário — o id da foto também aceitaria, mas o
  // comentário apareceria na foto, não na publicação do feed.
  const postId = json.post_id ?? json.id;
  if (!postId) throw new FacebookError("unknown", "resposta do Facebook sem o id do post");
  return { postId };
}

/** Publica um post de link/texto na Página (`POST /{page-id}/feed`). */
export async function publishLinkPost(creds: FacebookPageCredentials, input: PublishLinkInput): Promise<PublishedPost> {
  const json = (await graphFetch(
    `/${encodeURIComponent(creds.pageId)}/feed`,
    formBody({
      message: input.mensagem,
      link: input.link,
      access_token: creds.accessToken,
    })
  )) as { id?: string };

  if (!json.id) throw new FacebookError("unknown", "resposta do Facebook sem o id do post");
  return { postId: json.id };
}

/**
 * Publica um comentário num post já criado (`POST /{post-id}/comments`) —
 * é onde o link vai, pela mecânica de captação descrita na especificação
 * (o link nunca vai na descrição do post).
 */
export async function commentOnPost(
  creds: FacebookPageCredentials,
  postId: string,
  mensagem: string
): Promise<PublishedComment> {
  const json = (await graphFetch(
    `/${encodeURIComponent(postId)}/comments`,
    formBody({ message: mensagem, access_token: creds.accessToken })
  )) as { id?: string };

  if (!json.id) throw new FacebookError("unknown", "resposta do Facebook sem o id do comentário");
  return { commentId: json.id };
}
