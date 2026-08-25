import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetch as undiciFetch } from "undici";
import { createOpenRouterTextProvider, validateOpenRouterKey } from "./openrouter.js";
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
