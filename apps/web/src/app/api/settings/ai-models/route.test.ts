import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentSession }));

const getDecryptedApiKey = vi.fn();
vi.mock("@/lib/api-keys", () => ({ getDecryptedApiKey }));

const db = { aiModelSettings: { findUnique: vi.fn(), upsert: vi.fn() } };
vi.mock("@wordbee/db", () => ({ prisma: db }));

const fetchOpenRouterCatalog = vi.fn();
const testOpenRouterModel = vi.fn();
vi.mock("@wordbee/shared", async () => {
  const actual = await vi.importActual<typeof import("@wordbee/shared")>("@wordbee/shared");
  return { ...actual, fetchOpenRouterCatalog, testOpenRouterModel };
});

const settingsRoute = await import("./route.js");
const catalogRoute = await import("./catalog/route.js");
const testRoute = await import("./test/route.js");
const { clearCatalogCache } = await import("@/lib/ai-model-settings");

const SESSION = { user: { id: "user-1" }, sessionId: "s" };

function jsonRequest(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearCatalogCache();
  getCurrentSession.mockResolvedValue(SESSION);
  getDecryptedApiKey.mockResolvedValue("sk-or-x");
  db.aiModelSettings.findUnique.mockResolvedValue(null);
  db.aiModelSettings.upsert.mockImplementation(async ({ create }: { create: unknown }) => create);
});

describe("autenticação", () => {
  it("todas as rotas respondem 401 sem sessão", async () => {
    getCurrentSession.mockResolvedValue(null);
    const responses = await Promise.all([
      settingsRoute.GET(),
      settingsRoute.PUT(jsonRequest("https://app.test/api/settings/ai-models", "PUT", { textModel: "a/b" })),
      catalogRoute.GET(jsonRequest("https://app.test/api/settings/ai-models/catalog?tipo=texto", "GET")),
      testRoute.POST(jsonRequest("https://app.test/api/settings/ai-models/test", "POST", { tipo: "texto", modelId: "a/b" })),
    ]);
    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401]);
    expect(db.aiModelSettings.upsert).not.toHaveBeenCalled();
    expect(testOpenRouterModel).not.toHaveBeenCalled();
  });
});

describe("GET/PUT /api/settings/ai-models", () => {
  it("GET sem configuração mostra o padrão em uso", async () => {
    const res = await settingsRoute.GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.texto.salvo).toBeNull();
    expect(body.texto.origem).not.toBe("painel");
    expect(body.texto.emUso).toBe(body.texto.padrao);
  });

  it("PUT salva os modelos vinculados ao OpenRouter", async () => {
    const res = await settingsRoute.PUT(
      jsonRequest("https://app.test/api/settings/ai-models", "PUT", { textModel: "anthropic/claude-sonnet-5.5", imageModel: null })
    );
    expect(res.status).toBe(200);
    const [args] = db.aiModelSettings.upsert.mock.calls[0] as [{ create: Record<string, unknown> }];
    expect(args.create).toMatchObject({
      userId: "user-1",
      textProvider: "OPENROUTER",
      textModel: "anthropic/claude-sonnet-5.5",
      imageProvider: null,
      imageModel: null,
    });
    const body = await res.json();
    expect(body.texto).toMatchObject({ salvo: "anthropic/claude-sonnet-5.5", emUso: "anthropic/claude-sonnet-5.5", origem: "painel" });
  });

  it.each([
    ["com espaço", "deepseek/deepseek v4"],
    ["vazio", ""],
    ["só espaços", "   "],
    ["longo demais", `a/${"x".repeat(200)}`],
    ["não-string", 123],
  ])("PUT rejeita ID inválido (%s) com 400 e mensagem em português", async (_label, textModel) => {
    const res = await settingsRoute.PUT(jsonRequest("https://app.test/api/settings/ai-models", "PUT", { textModel }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/modelo/i);
    expect(db.aiModelSettings.upsert).not.toHaveBeenCalled();
  });

  it("PUT rejeita campos desconhecidos", async () => {
    const res = await settingsRoute.PUT(jsonRequest("https://app.test/api/settings/ai-models", "PUT", { userId: "outro" }));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/settings/ai-models/catalog", () => {
  it("devolve a lista normalizada do OpenRouter", async () => {
    fetchOpenRouterCatalog.mockResolvedValue([{ id: "a/b", nome: "AB", contexto: 1000, precoEntradaPorToken: 1e-6, precoSaidaPorToken: 2e-6, precoPorImagem: null }]);
    const res = await catalogRoute.GET(jsonRequest("https://app.test/api/settings/ai-models/catalog?tipo=texto", "GET"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.modelos).toHaveLength(1);
    expect(fetchOpenRouterCatalog).toHaveBeenCalledWith("text", "sk-or-x");
  });

  it("falha do OpenRouter → 200 com lista vazia (a tela continua aceitando ID digitado)", async () => {
    fetchOpenRouterCatalog.mockRejectedValue(new Error("OpenRouter fora do ar"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await catalogRoute.GET(jsonRequest("https://app.test/api/settings/ai-models/catalog?tipo=imagem", "GET"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ modelos: [], erro: expect.any(String) });
  });

  it("cache de 10 min: segunda chamada não vai ao OpenRouter", async () => {
    fetchOpenRouterCatalog.mockResolvedValue([]);
    await catalogRoute.GET(jsonRequest("https://app.test/api/settings/ai-models/catalog?tipo=texto", "GET"));
    await catalogRoute.GET(jsonRequest("https://app.test/api/settings/ai-models/catalog?tipo=texto", "GET"));
    expect(fetchOpenRouterCatalog).toHaveBeenCalledTimes(1);
  });

  it("tipo inválido → 400", async () => {
    const res = await catalogRoute.GET(jsonRequest("https://app.test/api/settings/ai-models/catalog?tipo=video", "GET"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/settings/ai-models/test", () => {
  it("testa com a chave do OpenRouter cadastrada", async () => {
    testOpenRouterModel.mockResolvedValue({ ok: true, mensagem: "ok" });
    const res = await testRoute.POST(jsonRequest("https://app.test/api/settings/ai-models/test", "POST", { tipo: "texto", modelId: "a/b" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, mensagem: "ok" });
    expect(testOpenRouterModel).toHaveBeenCalledWith("text", "sk-or-x", "a/b");
  });

  it("sem chave do OpenRouter cadastrada → erro legível", async () => {
    getDecryptedApiKey.mockResolvedValue(null);
    const res = await testRoute.POST(jsonRequest("https://app.test/api/settings/ai-models/test", "POST", { tipo: "imagem", modelId: "a/b" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/chave do OpenRouter/i);
  });

  it("ID inválido → 400 sem chamar o OpenRouter", async () => {
    const res = await testRoute.POST(jsonRequest("https://app.test/api/settings/ai-models/test", "POST", { tipo: "texto", modelId: "a b" }));
    expect(res.status).toBe(400);
    expect(testOpenRouterModel).not.toHaveBeenCalled();
  });
});
