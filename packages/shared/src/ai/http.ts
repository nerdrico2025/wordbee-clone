import { fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";
import { AiProviderError, classifyHttpError } from "./errors.js";

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * fetch com timeout, convertendo abort em AiProviderError("timeout").
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return (await undiciFetch(url, { ...init, signal: controller.signal })) as unknown as Response;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new AiProviderError("timeout", provider);
    }
    throw new AiProviderError("unknown", provider, err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

/** Faz fetch e lança AiProviderError normalizado se a resposta não for OK. */
export async function fetchJsonOrThrow(
  provider: string,
  url: string,
  init: UndiciRequestInit,
  timeoutMs?: number
): Promise<unknown> {
  const res = await fetchWithTimeout(provider, url, init, timeoutMs);
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw classifyHttpError(res.status, provider, bodyText);
  }
  return res.json();
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
