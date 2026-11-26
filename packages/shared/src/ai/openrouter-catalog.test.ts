import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetch as undiciFetch } from "undici";
import { fetchOpenRouterCatalog, testOpenRouterModel } from "./openrouter-catalog.js";
import { createOpenRouterTextProvider, createOpenRouterImageProvider } from "./openrouter.js";

vi.mock("undici", async () => {
  const actual = await vi.importActual<typeof import("undici")>("undici");
  return { ...actual, fetch: vi.fn() };
});

const fetchMock = vi.mocked(undiciFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function calledUrls(): string[] {
  return fetchMock.mock.calls.map(([url]) => String(url));
}

beforeEach(() => {
  fetchMock.mockReset();
});

const TEXT_MODELS = {
  data: [
    {
      id: "deepseek/deepseek-v4-flash-0731",
      name: "DeepSeek V4 Flash",
      context_length: 128000,
      pricing: { prompt: "0.0000002", completion: "0.0000008", image: "0", request: "0" },
      architecture: { output_modalities: ["text"] },
    },
    { id: "sem/preco", name: "Sem preço", context_length: null, architecture: { output_modalities: ["text"] } },
  ],
};

describe("fetchOpenRouterCatalog", () => {
  it("texto: lista /models filtrando output_modalities=text e normaliza id, nome, preço por token e contexto", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(TEXT_MODELS) as never);

    const models = await fetchOpenRouterCatalog("text", "sk-or-x");

    expect(calledUrls()[0]).toBe("https://openrouter.ai/api/v1/models?output_modalities=text");
    expect(models).toEqual([
      {
        id: "deepseek/deepseek-v4-flash-0731",
        nome: "DeepSeek V4 Flash",
        contexto: 128000,
        precoEntradaPorToken: 0.0000002,
        precoSaidaPorToken: 0.0000008,
        precoPorImagem: null,
      },
      { id: "sem/preco", nome: "Sem preço", contexto: null, precoEntradaPorToken: null, precoSaidaPorToken: null, precoPorImagem: null },
    ]);
  });

  it("imagem: usa a lista da Image API (/images/models, compatível com POST /images) e cruza o preço de /models?output_modalities=image", async () => {
    fetchMock.mockImplementation((async (url: string) => {
      if (String(url).endsWith("/images/models")) {
        return jsonResponse({ data: [{ id: "google/gemini-2.5-flash-image", name: "Nano Banana" }, { id: "x/so-na-image-api", name: "X" }] });
      }
      return jsonResponse({
        data: [
          {
            id: "google/gemini-2.5-flash-image",
            name: "Google: Gemini 2.5 Flash Image",
            context_length: 32768,
            pricing: { prompt: "0.0000003", completion: "0.0000025", image: "0.001" },
          },
        ],
      });
    }) as never);

    const models = await fetchOpenRouterCatalog("image", "sk-or-x");

    expect(calledUrls()).toContain("https://openrouter.ai/api/v1/images/models");
    expect(calledUrls()).toContain("https://openrouter.ai/api/v1/models?output_modalities=image");
    expect(models).toEqual([
      {
        id: "google/gemini-2.5-flash-image",
        nome: "Nano Banana",
        contexto: 32768,
        precoEntradaPorToken: 0.0000003,
        precoSaidaPorToken: 0.0000025,
        precoPorImagem: 0.001,
      },
      { id: "x/so-na-image-api", nome: "X", contexto: null, precoEntradaPorToken: null, precoSaidaPorToken: null, precoPorImagem: null },
    ]);
  });

  it("imagem: se /images/models falhar, cai para /models?output_modalities=image", async () => {
    fetchMock.mockImplementation((async (url: string) => {
      if (String(url).endsWith("/images/models")) return jsonResponse({ error: "boom" }, 500);
      return jsonResponse({ data: [{ id: "a/b", name: "AB", pricing: { completion: "0.00001" } }] });
    }) as never);

    const models = await fetchOpenRouterCatalog("image");
    expect(models.map((m) => m.id)).toEqual(["a/b"]);
  });

  it("lança quando o OpenRouter responde erro (quem chama decide devolver lista vazia)", async () => {
    fetchMock.mockImplementation((async () => jsonResponse({ error: "down" }, 503)) as never);
    await expect(fetchOpenRouterCatalog("text", "k")).rejects.toThrow();
  });

  it("envia a chave cadastrada no Authorization quando houver", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(TEXT_MODELS) as never);
    await fetchOpenRouterCatalog("text", "sk-or-abc");
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe("Bearer sk-or-abc");
  });
});

describe("testOpenRouterModel", () => {
  it("texto: chamada mínima (max_tokens baixo, sem stream) com o modelo escolhido", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: "ok" } }] }) as never);

    const result = await testOpenRouterModel("text", "sk-or-x", "anthropic/claude-sonnet-5.5");

    expect(result).toEqual({ ok: true, mensagem: expect.stringContaining("anthropic/claude-sonnet-5.5") });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(String((init as { body: string }).body));
    expect(body.model).toBe("anthropic/claude-sonnet-5.5");
    expect(body.stream).toBe(false);
    expect(body.max_tokens).toBeLessThanOrEqual(16);
  });

  it("texto: modelo inexistente devolve erro legível em português", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: "foo/bar is not a valid model ID" } }, 400) as never);

    const result = await testOpenRouterModel("text", "sk-or-x", "foo/bar");

    expect(result.ok).toBe(false);
    expect(result.mensagem).toMatch(/não encontrado/i);
    expect(result.mensagem).toContain("foo/bar");
  });

  it("texto: chave inválida usa a mensagem padrão do projeto", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "unauthorized" }, 401) as never);
    const result = await testOpenRouterModel("text", "ruim", "a/b");
    expect(result).toEqual({ ok: false, mensagem: expect.stringMatching(/Chave de API do OpenRouter inválida/) });
  });

  it("imagem: só confere que o modelo existe na Image API — nunca chama POST /images (sem custo)", async () => {
    fetchMock.mockImplementation((async () => jsonResponse({ data: [{ id: "google/gemini-2.5-flash-image", name: "Nano Banana" }] })) as never);

    const ok = await testOpenRouterModel("image", "sk-or-x", "google/gemini-2.5-flash-image");
    const naoExiste = await testOpenRouterModel("image", "sk-or-x", "nao/existe");

    expect(ok.ok).toBe(true);
    expect(naoExiste.ok).toBe(false);
    expect(naoExiste.mensagem).toMatch(/não encontrado/i);
    expect(calledUrls().every((u) => !u.endsWith("/images"))).toBe(true);
  });
});

describe("provedor OpenRouter recebe o model id resolvido", () => {
  it("imagem: envia o modelo passado na criação do provedor", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ b64_json: "AAAA" }] }) as never);
    await createOpenRouterImageProvider("k", "openai/gpt-image-1").generateImage({ prompt: "p" });
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as { body: string }).body));
    expect(body.model).toBe("openai/gpt-image-1");
  });

  it("texto: sem modelo explícito, usa env → padrão (comportamento antigo)", () => {
    expect(() => createOpenRouterTextProvider("k")).not.toThrow();
  });
});
