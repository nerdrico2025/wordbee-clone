import { fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";
import { AiProviderError, classifyHttpError } from "./errors.js";

// Padrão para chamadas que não fazem streaming (validação de chave,
// listagem de modelos, geração de imagem — a Image API do OpenRouter não
// suporta streaming). Chamadas de texto (título/artigo) usam
// `fetchStreamedTextOrThrow` abaixo, com timeout de inatividade em vez de
// um teto fixo — ver DECISIONS.md (2026-08-27). Ver também DECISIONS.md
// sobre o bug corrigido em 2026-08-25 (geração de artigo via OpenRouter
// travava pra sempre): antes, esse timeout só cobria o connect/headers,
// não a leitura do corpo da resposta.
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

// Timeout de INATIVIDADE (não um teto fixo pra chamada inteira): reseta a
// cada chunk novo recebido no stream. Ver DECISIONS.md (2026-08-27) — um
// teto fixo (60s/90s) matava chamadas que estavam progredindo normalmente,
// só demorando mais que o teto pra terminar um artigo longo.
const DEFAULT_IDLE_TIMEOUT_MS = 20_000;
// Teto absoluto de segurança, bem mais alto que o idle timeout — só pra
// garantir que uma conexão com chunks esporádicos (nunca ficando ociosa
// tempo suficiente pra estourar o idle timeout, mas também nunca
// terminando) não fique presa indefinidamente.
const DEFAULT_MAX_TIMEOUT_MS = 5 * 60_000;

export interface StreamedTextOptions {
  idleTimeoutMs?: number;
  maxTimeoutMs?: number;
}

interface OpenAiStreamChunk {
  choices?: Array<{ delta?: { content?: string } }>;
}

/**
 * Faz fetch com `stream: true` (formato SSE compatível com OpenAI: linhas
 * "data: {...}\n\n" terminando em "data: [DONE]") e concatena o texto de
 * `choices[0].delta.content` de cada chunk conforme chega, em vez de
 * esperar a resposta inteira de uma vez.
 *
 * O timeout NÃO é um teto fixo pra chamada inteira — é de inatividade
 * (`idleTimeoutMs`, reseta a cada chunk novo, incluindo comentários SSE de
 * keep-alive do OpenRouter tipo ": OPENROUTER PROCESSING", que não viram
 * linha `data:` mas ainda contam como atividade). Um `maxTimeoutMs`
 * absoluto continua existindo como rede de segurança final.
 *
 * Linhas `data:` malformadas isoladas são ignoradas (não derrubam o stream
 * inteiro) — só uma resposta HTTP de erro (`!res.ok`) ou o idle/max timeout
 * lançam.
 */
export async function fetchStreamedTextOrThrow(
  provider: string,
  url: string,
  init: UndiciRequestInit,
  options: StreamedTextOptions = {}
): Promise<string> {
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const maxTimeoutMs = options.maxTimeoutMs ?? DEFAULT_MAX_TIMEOUT_MS;

  const controller = new AbortController();
  let idleTimer: ReturnType<typeof setTimeout> = setTimeout(() => controller.abort(), idleTimeoutMs);
  const resetIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(), idleTimeoutMs);
  };
  const maxTimer = setTimeout(() => controller.abort(), maxTimeoutMs);

  try {
    const res = await rawFetch(provider, url, init, controller.signal);
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw classifyHttpError(res.status, provider, bodyText);
    }
    if (!res.body) throw new AiProviderError("unknown", provider, "resposta sem corpo (stream)");

    const reader = res.body.getReader();
    try {
      const decoder = new TextDecoder();
      let buffer = "";
      let content = "";
      let doneMarkerSeen = false;

      while (!doneMarkerSeen) {
        const { value, done: readerDone } = await reader.read();
        if (readerDone) break;
        resetIdleTimer(); // chunk novo chegou — reseta a inatividade, mesmo se não virar linha `data:`
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line.startsWith("data:")) continue; // linha vazia ou comentário SSE (keep-alive) — ignora
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") {
            doneMarkerSeen = true;
            break;
          }
          try {
            const parsed = JSON.parse(payload) as OpenAiStreamChunk;
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) content += delta;
          } catch {
            // linha `data:` malformada isolada — ignora e segue o stream.
          }
        }
      }

      return content;
    } finally {
      try {
        await reader.cancel();
      } catch {
        // ignora — o reader pode já ter sido consumido até o fim (stream
        // encerrado naturalmente), sem nada a cancelar.
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new AiProviderError("timeout", provider);
    }
    throw err;
  } finally {
    clearTimeout(idleTimer);
    clearTimeout(maxTimer);
  }
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
