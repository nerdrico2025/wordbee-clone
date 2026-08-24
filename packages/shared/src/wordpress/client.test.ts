import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetch as undiciFetch } from "undici";
import { testConnection, listCategories, uploadMedia, createPost } from "./client.js";
import { WordPressError } from "./errors.js";

vi.mock("undici", async () => {
  const actual = await vi.importActual<typeof import("undici")>("undici");
  return { ...actual, fetch: vi.fn() };
});

const CREDS = { url: "https://meublog.com.br", usuario: "admin", appPassword: "abcd efgh ijkl mnop" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("WordPress client", () => {
  const fetchMock = undiciFetch as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("testConnection: sucesso quando o usuário tem role administrator", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1, roles: ["administrator"] }));
    const result = await testConnection(CREDS);
    expect(result.isAdmin).toBe(true);
    expect(result.userId).toBe(1);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://meublog.com.br/wp-json/wp/v2/users/me?context=edit");
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
  });

  it("testConnection: lança not_admin quando o usuário não é administrador", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 2, roles: ["editor"] }));
    await expect(testConnection(CREDS)).rejects.toMatchObject({ code: "not_admin" });
  });

  it("testConnection: 401 vira unauthorized (sem retry, uma única chamada)", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));
    await expect(testConnection(CREDS)).rejects.toMatchObject({ code: "unauthorized" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("testConnection: 403 vira forbidden", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));
    await expect(testConnection(CREDS)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("testConnection: 404 vira not_found (REST API desabilitada)", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
    await expect(testConnection(CREDS)).rejects.toMatchObject({ code: "not_found" });
  });

  it("testConnection: rejeita site apontando para IP privado antes de chamar fetch", async () => {
    await expect(testConnection({ ...CREDS, url: "http://127.0.0.1" })).rejects.toBeInstanceOf(WordPressError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retry com backoff: erro de rede tenta 3 vezes e depois falha", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const start = Date.now();
    await expect(testConnection(CREDS)).rejects.toMatchObject({ code: "network" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // backoff de 500ms + 1000ms entre tentativas (sem contar a última)
    expect(Date.now() - start).toBeGreaterThanOrEqual(1400);
  }, 10_000);

  it("retry com backoff: sucede na segunda tentativa após uma falha de rede", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse({ id: 1, roles: ["administrator"] }));
    const result = await testConnection(CREDS);
    expect(result.isAdmin).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("listCategories: mapeia id e name", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { id: 1, name: "Receitas", extra: "ignorado" },
        { id: 2, name: "Tutoriais" },
      ])
    );
    const categories = await listCategories(CREDS);
    expect(categories).toEqual([
      { id: 1, name: "Receitas" },
      { id: 2, name: "Tutoriais" },
    ]);
  });

  it("uploadMedia: envia Content-Disposition e retorna id/sourceUrl", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 42, source_url: "https://meublog.com.br/imagem.png" }));
    const result = await uploadMedia(CREDS, { filename: "imagem.png", mimeType: "image/png", data: Buffer.from("fake") });
    expect(result).toEqual({ id: 42, sourceUrl: "https://meublog.com.br/imagem.png" });
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init.headers as Record<string, string>)["Content-Disposition"]).toContain("imagem.png");
  });

  it("createPost: envia status, categoria e featured_media e retorna id/link", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 99, link: "https://meublog.com.br/post-teste" }));
    const result = await createPost(CREDS, {
      title: "Post de teste",
      contentHtml: "<p>Olá</p>",
      status: "publish",
      categoryId: 3,
      featuredMediaId: 42,
    });
    expect(result).toEqual({ id: 99, link: "https://meublog.com.br/post-teste" });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ title: "Post de teste", status: "publish", categories: [3], featured_media: 42 });
  });
});
