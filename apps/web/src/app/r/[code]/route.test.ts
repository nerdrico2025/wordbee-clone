import { describe, it, expect, beforeEach, vi } from "vitest";

const db = {
  distributionLink: { findUnique: vi.fn(), update: vi.fn() },
};

vi.mock("@wordbee/db", () => ({ prisma: db }));

const { GET } = await import("./route.js");

function request(code = "aB3dE5f7") {
  return new Request(`https://app.test/r/${code}`) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.distributionLink.update.mockResolvedValue({});
});

describe("GET /r/:code", () => {
  it("conta o clique e redireciona 302 para o destino", async () => {
    db.distributionLink.findUnique.mockResolvedValue({ id: "link-1", destinoUrl: "https://blog.test/artigo" });

    const res = await GET(request(), { params: { code: "aB3dE5f7" } });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://blog.test/artigo");
    const [args] = db.distributionLink.update.mock.calls[0] as [{ data: { cliqueCount: unknown } }];
    expect(args.data.cliqueCount).toEqual({ increment: 1 });
  });

  it("código inexistente vai para a home, não para uma tela de erro técnica", async () => {
    db.distributionLink.findUnique.mockResolvedValue(null);

    const res = await GET(request("naoexiste"), { params: { code: "naoexiste" } });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://app.test/");
    expect(db.distributionLink.update).not.toHaveBeenCalled();
  });

  it("não redireciona para esquema que não seja http(s) — guarda contra open redirect", async () => {
    db.distributionLink.findUnique.mockResolvedValue({ id: "link-1", destinoUrl: "javascript:alert(1)" });

    const res = await GET(request(), { params: { code: "aB3dE5f7" } });

    expect(res.headers.get("location")).toBe("https://app.test/");
  });

  it("falha ao contar o clique não impede a visita — perder a métrica é melhor que perder o visitante", async () => {
    db.distributionLink.findUnique.mockResolvedValue({ id: "link-1", destinoUrl: "https://blog.test/artigo" });
    db.distributionLink.update.mockRejectedValue(new Error("Postgres indisponível"));
    const erroSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await GET(request(), { params: { code: "aB3dE5f7" } });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://blog.test/artigo");
    erroSpy.mockRestore();
  });
});
