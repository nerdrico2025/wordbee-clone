import { describe, it, expect, vi, beforeEach } from "vitest";

const publishPhotoPost = vi.fn();
const publishLinkPost = vi.fn();
const commentOnPost = vi.fn();

vi.mock("@wordbee/shared", async () => {
  const actual = await vi.importActual<typeof import("@wordbee/shared")>("@wordbee/shared");
  return { ...actual, publishPhotoPost, publishLinkPost, commentOnPost };
});

const getPageCredentials = vi.fn(async () => ({
  id: "page-1",
  nome: "Página A",
  pageId: "123456789",
  accessToken: "EAA-token",
}));
vi.mock("./facebook-pages.js", () => ({ getPageCredentials, findEligiblePages: vi.fn() }));

const db = {
  pageDistributionPost: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  facebookPage: { updateMany: vi.fn() },
};

vi.mock("@wordbee/db", () => ({ prisma: db }));

const { publishPageDistributionPost } = await import("./page-distribution-pipeline.js");
const { FacebookError } = await import("@wordbee/shared");

function noopLog() {
  /* silencia logs nos testes */
}

const READY_PACKAGE = {
  status: "PRONTO",
  copyDescricao: "Fiz esse bolo hoje e sumiu em minutos. Comenta QUERO...",
  copyComentario: "Tá aqui, ó:\n\nhttps://blog.test/bolo",
  linkDestino: "https://blog.test/bolo",
  imagens: ["https://blog.test/bolo.jpg"],
};

function setUpPost(overrides: Record<string, unknown> = {}, packageOverrides: Record<string, unknown> = {}) {
  db.pageDistributionPost.findUnique.mockResolvedValue({
    id: "post-1",
    packageId: "pkg-1",
    facebookPageId: "page-1",
    status: "AGENDADO",
    fbPostId: null,
    tentativas: 0,
    package: { ...READY_PACKAGE, ...packageOverrides },
    ...overrides,
  });
}

function updateDataAt(index: number): Record<string, unknown> {
  const [args] = db.pageDistributionPost.update.mock.calls[index] as [{ data: Record<string, unknown> }];
  return args.data;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.pageDistributionPost.update.mockResolvedValue({});
  db.pageDistributionPost.updateMany.mockResolvedValue({ count: 1 });
  db.facebookPage.updateMany.mockResolvedValue({ count: 1 });
  publishPhotoPost.mockResolvedValue({ postId: "123456789_999" });
  publishLinkPost.mockResolvedValue({ postId: "123456789_888" });
  commentOnPost.mockResolvedValue({ commentId: "123456789_999_1" });
});

describe("publishPageDistributionPost — caminho feliz", () => {
  it("publica a foto com a descrição e comenta o link em seguida", async () => {
    setUpPost();

    await publishPageDistributionPost("post-1", noopLog);

    expect(publishPhotoPost).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: "123456789" }),
      { mensagem: READY_PACKAGE.copyDescricao, imagemUrl: "https://blog.test/bolo.jpg" }
    );
    expect(commentOnPost).toHaveBeenCalledWith(expect.anything(), "123456789_999", READY_PACKAGE.copyComentario);

    // O id do post é gravado ANTES do comentário (idempotência contra crash).
    expect(updateDataAt(0)).toEqual({ fbPostId: "123456789_999" });
    const final = updateDataAt(1);
    expect(final.status).toBe("PUBLICADO");
    expect(final.fbCommentId).toBe("123456789_999_1");
    expect(final.erroMsg).toBeNull();
  });

  it("pacote sem imagem cai para post de link (fallback degradado, com link na descrição)", async () => {
    setUpPost({}, { imagens: [] });

    await publishPageDistributionPost("post-1", noopLog);

    expect(publishPhotoPost).not.toHaveBeenCalled();
    expect(publishLinkPost).toHaveBeenCalledWith(expect.anything(), {
      mensagem: READY_PACKAGE.copyDescricao,
      link: "https://blog.test/bolo",
    });
  });

  it("não republica quando o post já existe de uma tentativa anterior — só termina o comentário", async () => {
    setUpPost({ status: "PENDENTE", fbPostId: "123456789_999", tentativas: 1 });

    await publishPageDistributionPost("post-1", noopLog);

    expect(publishPhotoPost).not.toHaveBeenCalled();
    expect(publishLinkPost).not.toHaveBeenCalled();
    expect(commentOnPost).toHaveBeenCalledWith(expect.anything(), "123456789_999", READY_PACKAGE.copyComentario);
    expect(updateDataAt(0).status).toBe("PUBLICADO");
  });

  it("ignora publicação já finalizada (idempotência contra reivindicação repetida)", async () => {
    setUpPost({ status: "PUBLICADO" });

    await publishPageDistributionPost("post-1", noopLog);

    expect(publishPhotoPost).not.toHaveBeenCalled();
    expect(commentOnPost).not.toHaveBeenCalled();
    expect(db.pageDistributionPost.update).not.toHaveBeenCalled();
  });
});

describe("publishPageDistributionPost — falhas", () => {
  it("token expirado invalida a Página inteira e não fica retentando", async () => {
    setUpPost();
    publishPhotoPost.mockRejectedValue(new FacebookError("invalid_token", "Session has expired", 190));

    await publishPageDistributionPost("post-1", noopLog);

    expect(db.facebookPage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "page-1" }, data: expect.objectContaining({ statusValidacao: false }) })
    );
    const [args] = db.pageDistributionPost.updateMany.mock.calls[0] as [{ data: { status: string; erroMsg: string } }];
    expect(args.data.status).toBe("FALHA");
    expect(args.data.erroMsg).toMatch(/Token da Página inválido ou expirado/);
  });

  it("permissão insuficiente também invalida a Página (o usuário precisa agir)", async () => {
    setUpPost();
    publishPhotoPost.mockRejectedValue(new FacebookError("permission", "(#200) Insufficient permission", 200));

    await publishPageDistributionPost("post-1", noopLog);

    expect(db.facebookPage.updateMany).toHaveBeenCalled();
  });

  it("falha transitória reagenda com backoff em vez de desistir", async () => {
    setUpPost();
    publishPhotoPost.mockRejectedValue(new FacebookError("unavailable"));

    await publishPageDistributionPost("post-1", noopLog);

    expect(db.facebookPage.updateMany).not.toHaveBeenCalled();
    const data = updateDataAt(0);
    expect(data.status).toBe("PENDENTE");
    expect(data.tentativas).toBe(1);
    expect((data.scheduledFor as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it("rate limit do Facebook adia bem mais que uma falha de rede", async () => {
    setUpPost();
    publishPhotoPost.mockRejectedValue(new FacebookError("rate_limit", "Page request limit reached", 32));
    await publishPageDistributionPost("post-1", noopLog);
    const rateLimitDelay = (updateDataAt(0).scheduledFor as Date).getTime() - Date.now();

    vi.clearAllMocks();
    db.pageDistributionPost.update.mockResolvedValue({});
    setUpPost();
    publishPhotoPost.mockRejectedValue(new FacebookError("network", "ECONNRESET"));
    await publishPageDistributionPost("post-1", noopLog);
    const networkDelay = (updateDataAt(0).scheduledFor as Date).getTime() - Date.now();

    expect(rateLimitDelay).toBeGreaterThan(networkDelay);
  });

  it("desiste na última tentativa em vez de reagendar para sempre", async () => {
    setUpPost({ tentativas: 2 });
    publishPhotoPost.mockRejectedValue(new FacebookError("unavailable"));

    await publishPageDistributionPost("post-1", noopLog);

    const [args] = db.pageDistributionPost.updateMany.mock.calls[0] as [{ data: { status: string; tentativas: number } }];
    expect(args.data.status).toBe("FALHA");
    expect(args.data.tentativas).toBe(3);
  });

  it("falha no comentário não republica o post na próxima tentativa (fbPostId já gravado)", async () => {
    setUpPost();
    commentOnPost.mockRejectedValue(new FacebookError("unavailable"));

    await publishPageDistributionPost("post-1", noopLog);

    expect(updateDataAt(0)).toEqual({ fbPostId: "123456789_999" });
    expect(updateDataAt(1).status).toBe("PENDENTE");
  });

  it("pacote sem imagem e sem link falha em vez de publicar um texto que não leva a lugar nenhum", async () => {
    setUpPost({}, { imagens: [], linkDestino: null });

    await publishPageDistributionPost("post-1", noopLog);

    expect(publishPhotoPost).not.toHaveBeenCalled();
    expect(publishLinkPost).not.toHaveBeenCalled();
    const [args] = db.pageDistributionPost.updateMany.mock.calls[0] as [{ data: { status: string; erroMsg: string } }];
    expect(args.data.status).toBe("FALHA");
    expect(args.data.erroMsg).toMatch(/nem imagem nem link|não tem imagem nem link/);
  });

  it("pacote não pronto marca a publicação como falha em vez de publicar texto vazio", async () => {
    setUpPost({}, { status: "FALHA", copyDescricao: null, copyComentario: null });

    await publishPageDistributionPost("post-1", noopLog);

    expect(publishPhotoPost).not.toHaveBeenCalled();
    const [args] = db.pageDistributionPost.updateMany.mock.calls[0] as [{ data: { status: string } }];
    expect(args.data.status).toBe("FALHA");
  });

  it("nunca lança para quem chamou, mesmo com erro inesperado (o lock precisa ser liberado)", async () => {
    db.pageDistributionPost.findUnique.mockRejectedValue(new Error("conexão do Postgres caiu"));

    await expect(publishPageDistributionPost("post-1", noopLog)).resolves.toBeUndefined();
    expect(db.pageDistributionPost.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FALHA" }) })
    );
  });
});
