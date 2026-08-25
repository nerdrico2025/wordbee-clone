import { fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";
import { AiProviderError, classifyHttpError } from "./errors.js";

// Padrão para chamadas rápidas (sugestão de título, validação de chave,
// listagem de modelos). Chamadas naturalmente mais longas (geração de
// artigo completo, geração de imagem) devem passar um `timeoutMs` maior
// explicitamente — ver `ARTICLE_TIMEOUT_MS` em cada provider. Ver
// DECISIONS.md sobre o bug corrigido em 2026-08-25 (geração de artigo via
// OpenRouter travava pra sempre): antes, esse timeout só cobria o
// connect/headers, não a leitura do corpo da resposta.
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Executa `fn` sob um único AbortController, cobrindo TODA a operação que
 * `fn` faz com o `signal` recebido — não só o `fetch()` em si.
 *
 * Isso importa porque a promise de `fetch()` resolve assim que os headers
 * chegam; ler o corpo da resposta (`res.json()`/`res.text()`) é uma etapa
 * separada. Se o timer for cancelado logo depois do `fetch()` resolver (bug
 * corrigido aqui — ver DECISIONS.md), uma resposta cujos headers chegam
 * rápido mas cujo corpo demora pra terminar (ex.: um artigo inteiro gerado
 * por um modelo lento) fica sem nenhum timeout, pendurada indefinidamente.
 * Por isso `fetchJsonOrThrow` chama isto envolvendo fetch + leitura do
 * corpo, em vez de só o fetch.
 */
async function withTimeout<T>(provider: string, timeoutMs: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new AiProviderError("timeout", provider);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function rawFetch(provider: string, url: string, init: UndiciRequestInit, signal: AbortSignal): Promise<Response> {
  try {
    return (await undiciFetch(url, { ...init, signal })) as unknown as Response;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new AiProviderError("unknown", provider, err instanceof Error ? err.message : String(err));
  }
}

/**
 * fetch com timeout, convertendo abort em AiProviderError("timeout").
 * Cobre só o `fetch()` em si (connect + headers) — se o chamador for ler o
 * corpo da resposta depois (`res.json()`/`res.text()`), essa leitura fica
 * fora dessa janela de timeout. Usado hoje só por chamadas que não
 * precisam ler um corpo grande (`validateXKey`, download de imagem já
 * pronta). Para chamadas que leem o corpo da resposta do modelo, use
 * `fetchJsonOrThrow`, que cobre a operação inteira.
 *
 * Usa `undici` explicitamente em vez de `globalThis.fetch`: o Next.js
 * substitui o fetch global do processo por uma versão própria (com camada
 * de cache/instrumentação), que já se mostrou instável para chamadas
 * server-to-server a provedores externos (respostas de erro HTTP viravam
 * exceções genéricas em vez de Response). Como este pacote roda tanto
 * dentro do processo web quanto do worker, é mais seguro não depender do
 * comportamento do fetch global do host.
 */
export async function fetchWithTimeout(
  provider: string,
  url: string,
  init: UndiciRequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  return withTimeout(provider, timeoutMs, (signal) => rawFetch(provider, url, init, signal));
}

/**
 * Faz fetch e lança AiProviderError normalizado se a resposta não for OK.
 * O timeout cobre a operação inteira — fetch (connect/headers) E a leitura
 * do corpo da resposta (`res.json()`/`res.text()`) — não só o fetch em si.
 */
export async function fetchJsonOrThrow(
  provider: string,
  url: string,
  init: UndiciRequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<unknown> {
  return withTimeout(provider, timeoutMs, async (signal) => {
    const res = await rawFetch(provider, url, init, signal);
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw classifyHttpError(res.status, provider, bodyText);
    }
    return res.json();
  });
}

function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(json)?/i, "")
    .replace(/```$/, "")
    .trim();
}

/** Extrai um array JSON de string de uma resposta de texto do modelo (tolerante a cercas ```json). */
export function parseJsonArrayResponse(text: string, provider: string): string[] {
  try {
    const parsed = JSON.parse(stripCodeFences(text));
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
    throw new Error("not an array");
  } catch {
    // eslint-disable-next-line no-console
    console.error(`[ai:${provider}] parseJsonArrayResponse falhou. Texto bruto:`, text);
    throw new AiProviderError("unknown", provider, "resposta do modelo não é um JSON array válido");
  }
}

/** Extrai um objeto JSON de uma resposta de texto do modelo (tolerante a cercas ```json). */
export function parseJsonObjectResponse<T>(text: string, provider: string): T {
  try {
    const parsed = JSON.parse(stripCodeFences(text));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as T;
    }
    throw new Error("not an object");
  } catch {
    throw new AiProviderError("unknown", provider, "resposta do modelo não é um JSON válido");
  }
}
