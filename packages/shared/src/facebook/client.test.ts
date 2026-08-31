import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetch as undiciFetch } from "undici";
import { validatePageToken, publishPhotoPost, publishLinkPost, commentOnPost } from "./client.js";
import { FacebookError } from "./errors.js";

vi.mock("undici", async () => {
  const actual = await vi.importActual<typeof import("undici")>("undici");
  return { ...actual, fetch: vi.fn() };
});

const fetchMock = vi.mocked(undiciFetch);

const CREDS = { pageId: "123456789", accessToken: "EAAG-token-de-pagina" };

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

/** Envelope de erro real da Graph API: o status HTTP é quase sempre 400. */
function graphErrorResponse(fbCode: number, message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: { message, type: "OAuthException", code: fbCode, fbtrace_id: "abc" } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function lastCall(): { url: string; init: { method?: string; body?: string } } {
  const call = fetchMock.mock.calls.at(-1) as unknown as [string, { method?: string; body?: string }];
  return { url: call[0], init: call[1] };
}

function bodyParams(): URLSearchParams {
  return new URLSearchParams(lastCall().init.body ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("validatePageToken", () => {
  it("devolve id e nome da Página quando o token é válido", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ id: "123456789", name: "Receitas da Vovó" }) as never);

    const info = await validatePageToken(CREDS);

    expect(info).toEqual({ id: "123456789", nome: "Receitas da Vovó" });
    expect(lastCall().url).toContain("/123456789?fields=id,name");
  });

  it("manda o token no header Authorization, NUNCA na URL", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ id: "123456789", name: "Página" }) as never);

    await validatePageToken(CREDS);

    const call = fetchMock.mock.calls.at(-1) as unknown as [string, { headers?: Record<string, string> }];
    expect(call[0]).not.toContain("EAAG-token-de-pagina");
    expect(call[0]).not.toContain("access_token");
    expect(call[1].headers?.Authorization).toBe("Bearer EAAG-token-de-pagina");
  });

  it("usa o id como nome quando a Página não devolve name", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ id: "123456789" }) as never);
    await expect(validatePageToken(CREDS)).resolves.toEqual({ id: "123456789", nome: "123456789" });
  });

  it("classifica o código 190 como token inválido/expirado, não como erro genérico", async () => {
    fetchMock.mockResolvedValueOnce(graphErrorResponse(190, "Error validating access token: Session has expired") as never);

    const err = await validatePageToken(CREDS).catch((e) => e);

    expect(err).toBeInstanceOf(FacebookError);
    expect(err.code).toBe("invalid_token");
    expect(err.fbCode).toBe(190);
    expect(err.userMessage).toMatch(/Token da Página inválido ou expirado/);
  });

  it("classifica o código 200 (faixa de permissão) como permission", async () => {
    fetchMock.mockResolvedValueOnce(graphErrorResponse(200, "Permissions error") as never);

    const err = await validatePageToken(CREDS).catch((e) => e);

    expect(err.code).toBe("permission");
  });

  it("classifica os códigos de throttling como rate_limit", async () => {
    fetchMock.mockResolvedValueOnce(graphErrorResponse(4, "Application request limit reached") as never);
    await expect(validatePageToken(CREDS).catch((e) => e.code)).resolves.toBe("rate_limit");

    fetchMock.mockResolvedValueOnce(graphErrorResponse(32, "Page request limit reached") as never);
    await expect(validatePageToken(CREDS).catch((e) => e.code)).resolves.toBe("rate_limit");
  });

  it("cai no status HTTP quando o corpo não tem o envelope de erro da Graph API", async () => {
    fetchMock.mockResolvedValue(new Response("<html>gateway timeout</html>", { status: 504 }) as never);

    const err = await validatePageToken(CREDS).catch((e) => e);

    // 504 é transitório: withRetry tenta 3 vezes antes de desistir.
    expect(err.code).toBe("unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("não repete a chamada quando o erro é determinístico (token inválido)", async () => {
    fetchMock.mockResolvedValueOnce(graphErrorResponse(190, "invalid token") as never);

    await validatePageToken(CREDS).catch(() => undefined);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("converte falha de rede em FacebookError('network')", async () => {
    fetchMock.mockRejectedValue(new Error("getaddrinfo ENOTFOUND graph.facebook.com") as never);

    const err = await validatePageToken(CREDS).catch((e) => e);

    expect(err).toBeInstanceOf(FacebookError);
    expect(err.code).toBe("network");
  });
});

describe("publishPhotoPost", () => {
  it("posta a foto por URL pública e devolve o post_id do feed (não o id da foto)", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ id: "111", post_id: "123456789_999" }) as never);

    const result = await publishPhotoPost(CREDS, { mensagem: "Olha essa receita...", imagemUrl: "https://blog.test/img.png" });

    expect(result).toEqual({ postId: "123456789_999" });
    expect(lastCall().url).toContain("/123456789/photos");
    expect(lastCall().init.method).toBe("POST");

    const params = bodyParams();
    expect(params.get("url")).toBe("https://blog.test/img.png");
    expect(params.get("caption")).toBe("Olha essa receita...");
    expect(params.get("published")).toBe("true");
    expect(params.get("access_token")).toBe("EAAG-token-de-pagina");
  });

  it("cai para o id da foto quando a resposta não traz post_id", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ id: "111" }) as never);
    await expect(publishPhotoPost(CREDS, { mensagem: "oi", imagemUrl: "https://blog.test/i.png" })).resolves.toEqual({ postId: "111" });
  });

  it("lança quando a resposta não traz nenhum id utilizável", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}) as never);

    const err = await publishPhotoPost(CREDS, { mensagem: "oi", imagemUrl: "https://blog.test/i.png" }).catch((e) => e);

    expect(err).toBeInstanceOf(FacebookError);
    expect(err.code).toBe("unknown");
  });

  it("o token nunca vai na URL de um POST (só no corpo do formulário)", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ post_id: "123456789_999" }) as never);

    await publishPhotoPost(CREDS, { mensagem: "oi", imagemUrl: "https://blog.test/i.png" });

    expect(lastCall().url).not.toContain("EAAG-token-de-pagina");
  });
});

describe("publishLinkPost", () => {
  it("posta no feed com mensagem e link", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ id: "123456789_777" }) as never);

    const result = await publishLinkPost(CREDS, { mensagem: "Saiu no blog", link: "https://blog.test/post" });

    expect(result).toEqual({ postId: "123456789_777" });
    expect(lastCall().url).toContain("/123456789/feed");
    expect(bodyParams().get("link")).toBe("https://blog.test/post");
    expect(bodyParams().get("message")).toBe("Saiu no blog");
  });
});

describe("commentOnPost", () => {
  it("comenta no post publicado (é onde o link vai)", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ id: "123456789_999_555" }) as never);

    const result = await commentOnPost(CREDS, "123456789_999", "Tá aqui, ó: https://blog.test/post");

    expect(result).toEqual({ commentId: "123456789_999_555" });
    expect(lastCall().url).toContain("/123456789_999/comments");
    expect(bodyParams().get("message")).toBe("Tá aqui, ó: https://blog.test/post");
  });

  it("propaga erro de permissão do Facebook com mensagem em português", async () => {
    fetchMock.mockResolvedValueOnce(graphErrorResponse(200, "(#200) Insufficient permission") as never);

    const err = await commentOnPost(CREDS, "123456789_999", "oi").catch((e) => e);

    expect(err.code).toBe("permission");
    expect(err.userMessage).toMatch(/não tem permissão/);
  });
});
