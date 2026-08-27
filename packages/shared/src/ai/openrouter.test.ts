import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetch as undiciFetch } from "undici";
import { createOpenRouterTextProvider, createOpenRouterImageProvider, validateOpenRouterKey } from "./openrouter.js";
import { AiProviderError } from "./errors.js";

vi.mock("undici", async () => {
  const actual = await vi.importActual<typeof import("undici")>("undici");
  return { ...actual, fetch: vi.fn() };
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// --- Helpers de resposta em streaming (SSE), usados por chatCompletion
// (generateTitles/generateArticle) desde a mudança de timeout fixo pra
// idle-timeout em 2026-08-27 — ver DECISIONS.md.

type FakeReader = { read: () => Promise<{ value?: Uint8Array; done: boolean }> };
type FakeStreamResponse = { ok: true; body: { getReader: () => FakeReader } };

function sseLine(delta: string | null): string {
  return delta === null ? "data: [DONE]\n\n" : `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`;
}

/** Reader cujos chunks (já prontos, um por `read()`) chegam imediatamente, sem gap. */
function immediateSseStream(deltas: Array<string | null>): FakeStreamResponse {
  let i = 0;
  const encoder = new TextEncoder();
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => {
          if (i >= deltas.length) return { done: true, value: undefined };
          const value = encoder.encode(sseLine(deltas[i]!));
          i++;
          return { done: false, value };
        },
      }),
    },
  };
}

/** Reader cujos chunks só chegam depois de `gapMs` (via setTimeout, controlável com fake timers). */
function spacedSseStream(deltas: Array<string | null>, gapMs: number): FakeStreamResponse {
  let i = 0;
  const encoder = new TextEncoder();
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: () =>
          new Promise((resolve) => {
            if (i >= deltas.length) {
              resolve({ done: true, value: undefined });
              return;
            }
            const delta = deltas[i]!;
            i++;
            setTimeout(() => resolve({ done: false, value: encoder.encode(sseLine(delta)) }), gapMs);
          }),
      }),
    },
  };
}

/** Reader que nunca resolve sozinho — só quando o AbortSignal da chamada dispara (idle/max timeout). */
function mockHangingStream(fetchMock: ReturnType<typeof vi.fn>): void {
  fetchMock.mockImplementationOnce((_url: string, init: { signal: AbortSignal }) =>
    Promise.resolve({
      ok: true,
      body: {
        getReader: () => ({
          read: () =>
            new Promise((_resolve, reject) => {
              init.signal.addEventListener("abort", () => {
                reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }));
              });
            }),
        }),
      },
    })
  );
}

function splitIntoChunks(text: string, n: number): string[] {
  const size = Math.ceil(text.length / n);
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

describe("OpenRouterProvider", () => {
  const fetchMock = undiciFetch as unknown as ReturnType<typeof vi.fn>;
  const provider = createOpenRouterTextProvider("sk-or-fake-key");

  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("generateTitles: sucesso (via streaming), envia Authorization/HTTP-Referer/X-Title/stream:true e retorna a lista de títulos", async () => {
    fetchMock.mockResolvedValueOnce(immediateSseStream(['["Título 1", "Título 2"]', null]));

    const titles = await provider.generateTitles({ tipo: "RECEITA", tema: "bolo de cenoura" });
    expect(titles).toEqual(["Título 1", "Título 2"]);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-or-fake-key");
    expect(headers["HTTP-Referer"]).toBeTruthy();
    expect(headers["X-Title"]).toBeTruthy();

    const body = JSON.parse(init.body as string);
    expect(body.model).toMatch(/deepseek/);
    expect(body.stream).toBe(true);
  });

  it("erro de créditos insuficientes (402) vira insufficient_credits com mensagem em português", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: 402, message: "Insufficient credits" } }, 402)
    );

    const err = await provider.generateTitles({ tipo: "RECEITA", tema: "bolo de cenoura" }).catch((e) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect((err as AiProviderError).code).toBe("insufficient_credits");
    expect((err as AiProviderError).userMessage).toContain("Créditos insuficientes");
    expect((err as AiProviderError).userMessage).toContain("openrouter.ai");
  });

  it("chave inválida (401) vira invalid_key", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));

    const err = await provider.generateTitles({ tipo: "RECEITA", tema: "bolo de cenoura" }).catch((e) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect((err as AiProviderError).code).toBe("invalid_key");
  });

  it("timeout: fetch abortado vira AiProviderError('timeout')", async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }));

    const err = await provider.generateTitles({ tipo: "RECEITA", tema: "bolo de cenoura" }).catch((e) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect((err as AiProviderError).code).toBe("timeout");
  });

  it("generateArticle: sucesso (via streaming), parseia o JSON e usa o slug do título", async () => {
    fetchMock.mockResolvedValueOnce(
      immediateSseStream([
        JSON.stringify({ contentHtml: "<p>Conteúdo</p>", excerpt: "Resumo curto", metaTitle: "Título SEO" }),
        null,
      ])
    );

    const article = await provider.generateArticle({ tipo: "RECEITA", tema: "bolo de cenoura", titulo: "Bolo de Cenoura Fofinho" });
    expect(article.contentHtml).toBe("<p>Conteúdo</p>");
    expect(article.metaTitle).toBe("Título SEO");
    expect(article.slug).toBe("bolo-de-cenoura-fofinho");
  });

  // Mudança de timeout fixo (60s/90s) pra idle timeout com streaming
  // (2026-08-27, ver DECISIONS.md) — motivada por um padrão real de
  // produção: a maioria das chamadas ao OpenRouter batia exatamente o teto
  // fixo, incluindo respostas que provavelmente estavam progredindo
  // normalmente, só demorando mais que o teto pra terminar um artigo longo.
  it("generateArticle: nenhum chunk chega (silêncio total) além do idle timeout (20s) — aborta em vez de ficar pendurado", async () => {
    vi.useFakeTimers();
    mockHangingStream(fetchMock);

    const promise = provider.generateArticle({ tipo: "RECEITA", tema: "bolo de cenoura", titulo: "Bolo de Cenoura" });
    const expectation = expect(promise).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(20_000);
    await expectation;
  });

  it("generateTitles usa o MESMO mecanismo de idle timeout que generateArticle", async () => {
    vi.useFakeTimers();
    mockHangingStream(fetchMock);

    const promise = provider.generateTitles({ tipo: "RECEITA", tema: "bolo de cenoura" });
    const expectation = expect(promise).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(20_000);
    await expectation;
  });

  it("generateArticle: resposta longa com chunks espaçados (nenhum gap > idle timeout) completa com sucesso, mesmo levando mais que os 90s do teto fixo antigo no total", async () => {
    vi.useFakeTimers();
    const fullJson = JSON.stringify({
      contentHtml: "<p>Artigo bem longo, gerado aos poucos, chunk por chunk.</p>",
      excerpt: "Resumo",
      metaTitle: "Título SEO",
    });
    const pieces = splitIntoChunks(fullJson, 8); // 8 pedaços + [DONE] = 9 reads
    const gapMs = 15_000; // < 20s de idle timeout, mas 9 × 15s = 135s > 90s do teto fixo antigo
    fetchMock.mockResolvedValueOnce(spacedSseStream([...pieces, null], gapMs));

    const promise = provider.generateArticle({ tipo: "RECEITA", tema: "bolo de cenoura", titulo: "Bolo de Cenoura" });
    for (let i = 0; i <= pieces.length; i++) {
      await vi.advanceTimersByTimeAsync(gapMs);
    }

    const article = await promise;
    expect(article.contentHtml).toBe("<p>Artigo bem longo, gerado aos poucos, chunk por chunk.</p>");
    expect(article.metaTitle).toBe("Título SEO");
  });
});

describe("OpenRouterImageProvider", () => {
  const fetchMock = undiciFetch as unknown as ReturnType<typeof vi.fn>;
  const provider = createOpenRouterImageProvider("sk-or-fake-key");

  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("geração simples (sem referência): chama POST /images e retorna a imagem em base64", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ b64_json: "IMG_B64", media_type: "image/png" }] }));

    const image = await provider.generateImage({ prompt: "um bolo de cenoura" });
    expect(image).toEqual({ base64: "IMG_B64", mimeType: "image/png" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/images");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-or-fake-key");
    expect(headers["HTTP-Referer"]).toBeTruthy();

    const body = JSON.parse(init.body as string);
    expect(body.model).toMatch(/gemini-2\.5-flash-image/);
    expect(body.input_references).toBeUndefined();
  });

  it("geração com imagens de referência: envia input_references como data URLs", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ b64_json: "IMG_B64", media_type: "image/png" }] }));

    await provider.generateImage({
      prompt: "um bolo de cenoura",
      referenceImages: [
        { base64: "REF1", mimeType: "image/jpeg" },
        { base64: "REF2", mimeType: "image/webp" },
      ],
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    expect(body.input_references).toEqual([
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,REF1" } },
      { type: "image_url", image_url: { url: "data:image/webp;base64,REF2" } },
    ]);
  });

  it("créditos insuficientes (402) vira insufficient_credits", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 402, message: "Insufficient credits" } }, 402));

    const err = await provider.generateImage({ prompt: "um bolo de cenoura" }).catch((e) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect((err as AiProviderError).code).toBe("insufficient_credits");
  });

  it("timeout: fetch abortado vira AiProviderError('timeout')", async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }));

    const err = await provider.generateImage({ prompt: "um bolo de cenoura" }).catch((e) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect((err as AiProviderError).code).toBe("timeout");
  });

  it("modelo sem suporte a input_references: refaz a chamada sem referência em vez de falhar", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: 'Model does not support "input_references" for this endpoint' } }, 400)
      )
      .mockResolvedValueOnce(jsonResponse({ data: [{ b64_json: "IMG_B64", media_type: "image/png" }] }));

    const image = await provider.generateImage({
      prompt: "um bolo de cenoura",
      referenceImages: [{ base64: "REF1", mimeType: "image/jpeg" }],
    });

    expect(image).toEqual({ base64: "IMG_B64", mimeType: "image/png" });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(firstBody.input_references).toBeDefined();
    const secondBody = JSON.parse(fetchMock.mock.calls[1]![1].body as string);
    expect(secondBody.input_references).toBeUndefined();
  });

  it("erro 400 não relacionado a input_references não aciona o fallback (propaga o erro)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: "prompt is required" } }, 400));

    const err = await provider
      .generateImage({ prompt: "um bolo de cenoura", referenceImages: [{ base64: "REF1", mimeType: "image/jpeg" }] })
      .catch((e) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("validateOpenRouterKey", () => {
  const fetchMock = undiciFetch as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("chama GET /models (chamada gratuita) e resolve sem erro em caso de sucesso", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));
    await expect(validateOpenRouterKey("sk-or-fake-key")).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/models");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-or-fake-key");
  });

  it("chave inválida (401) lança invalid_key", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));
    await expect(validateOpenRouterKey("chave-ruim")).rejects.toMatchObject({ code: "invalid_key" });
  });
});
