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

  it("generateTitles: sucesso, envia Authorization/HTTP-Referer/X-Title e retorna a lista de títulos", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ choices: [{ message: { content: '["Título 1", "Título 2"]' } }] })
    );

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

  it("generateArticle: sucesso, parseia o JSON e usa o slug do título", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                contentHtml: "<p>Conteúdo</p>",
                excerpt: "Resumo curto",
                metaTitle: "Título SEO",
              }),
            },
          },
        ],
      })
    );

    const article = await provider.generateArticle({ tipo: "RECEITA", tema: "bolo de cenoura", titulo: "Bolo de Cenoura Fofinho" });
    expect(article.contentHtml).toBe("<p>Conteúdo</p>");
    expect(article.metaTitle).toBe("Título SEO");
    expect(article.slug).toBe("bolo-de-cenoura-fofinho");
  });

  // Regressão do bug real de produção (2026-08-25): geração de artigo via
  // OpenRouter ficava pendurada indefinidamente (5+ min, sem erro) quando
  // os headers da resposta chegavam rápido mas o corpo (um artigo inteiro)
  // demorava para terminar de chegar — o timeout só cobria o connect/
  // headers, não a leitura do corpo (ver fix em packages/shared/src/ai/http.ts).
  // O mock abaixo simula exatamente isso: `fetch()` resolve na hora (como
  // se os headers já tivessem chegado), mas `.json()` só resolve/rejeita
  // quando o AbortSignal passado pra ele dispara — igual ao comportamento
  // real do undici ao ler o corpo de uma resposta abortada meio do caminho.
  function mockHangingBody() {
    fetchMock.mockImplementationOnce((_url: string, init: { signal: AbortSignal }) =>
      Promise.resolve({
        ok: true,
        json: () =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () => {
              reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }));
            });
          }),
      })
    );
  }

  it("generateArticle: corpo da resposta nunca termina de chegar — estoura o timeout (90s) em vez de ficar pendurado para sempre", async () => {
    vi.useFakeTimers();
    mockHangingBody();

    const promise = provider.generateArticle({ tipo: "RECEITA", tema: "bolo de cenoura", titulo: "Bolo de Cenoura" });
    const expectation = expect(promise).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(90_000);
    await expectation;
  });

  it("generateTitles usa o MESMO mecanismo de timeout que generateArticle, só que com a janela padrão (mais curta)", async () => {
    vi.useFakeTimers();
    mockHangingBody();

    const promise = provider.generateTitles({ tipo: "RECEITA", tema: "bolo de cenoura" });
    const expectation = expect(promise).rejects.toMatchObject({ code: "timeout" });
    // Timeout padrão do provider (60s) — bem menor que os 90s de
    // generateArticle, mas o mesmo AbortController/AiErrorCode "timeout".
    await vi.advanceTimersByTimeAsync(60_000);
    await expectation;
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
