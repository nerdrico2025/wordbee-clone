import { describe, it, expect, vi, beforeEach } from "vitest";

const generateDistributionCopy = vi.fn();
const generateImage = vi.fn();
const uploadMedia = vi.fn();

vi.mock("@wordbee/shared", async () => {
  const actual = await vi.importActual<typeof import("@wordbee/shared")>("@wordbee/shared");
  return {
    ...actual,
    createTextProvider: vi.fn(() => ({
      generateTitles: vi.fn(),
      generateArticle: vi.fn(),
      generateDistributionCopy,
    })),
    createImageProvider: vi.fn(() => ({ generateImage })),
    uploadMedia,
  };
});

const getDecryptedApiKey = vi.fn(async () => "fake-key");
vi.mock("./api-keys.js", () => ({ getDecryptedApiKey }));

vi.mock("./wp-sites.js", () => ({
  getSiteCredentials: vi.fn(async () => ({ url: "https://blog.test", usuario: "admin", appPassword: "xxxx" })),
}));

const findEligiblePages = vi.fn();
vi.mock("./facebook-pages.js", () => ({ findEligiblePages }));

/** Classe mínima que reproduz o formato de erro do Prisma que o código inspeciona. */
class FakeKnownRequestError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

const db = {
  article: { findMany: vi.fn() },
  distributionPackage: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  pageDistributionPost: { createMany: vi.fn() },
  divulgacaoPerfil: { count: vi.fn() },
  wpSite: { findUnique: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
};

vi.mock("@wordbee/db", () => ({
  prisma: db,
  Prisma: { PrismaClientKnownRequestError: FakeKnownRequestError },
}));

const { enqueueDistributionPackages, buildDistributionPackage } = await import("./distribution-package-builder.js");

const fakeRedis = { eval: vi.fn(async () => 1) };

function noopLog() {
  /* silencia logs nos testes */
}

const BASE_ARTICLE = {
  id: "article-1",
  userId: "user-1",
  wpSiteId: "site-1",
  titulo: "Bolo de cenoura sem farinha",
  tema: "receitas fáceis",
  tipo: "RECEITA",
  iaTexto: "OPENROUTER",
  iaImagem: "OPENROUTER",
  slug: "bolo-de-cenoura",
  imageUrl: "https://blog.test/wp-content/bolo.jpg",
  wpUrl: "https://blog.test/bolo-de-cenoura",
};

const COPY_A = {
  copyDescricao: "Fiz esse bolo hoje e sumiu em minutos. Comenta QUERO que eu te mando...",
  copyComentario: "Tá aqui, ó — é só entrar e pegar a receita completa:",
  palavraChave: "QUERO",
};
const COPY_B = {
  copyDescricao: "Ninguém acredita que leva só 3 ingredientes. Comenta ENVIA...",
  copyComentario: "Prontinho, o passo a passo está aqui:",
  palavraChave: "ENVIA",
};

function updateData(index = 0): Record<string, unknown> {
  const [args] = db.distributionPackage.update.mock.calls[index] as [{ data: Record<string, unknown> }];
  return args.data;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.distributionPackage.update.mockResolvedValue({});
  db.pageDistributionPost.createMany.mockResolvedValue({ count: 0 });
  db.divulgacaoPerfil.count.mockResolvedValue(0);
  db.wpSite.findUnique.mockResolvedValue({ url: "https://blog.test" });
  generateDistributionCopy.mockResolvedValue([COPY_A, COPY_B]);
  generateImage.mockResolvedValue({ base64: "AAAA", mimeType: "image/png" });
  uploadMedia.mockImplementation(async (_creds: unknown, input: { filename: string }) => ({
    id: 1,
    sourceUrl: `https://blog.test/wp-content/${input.filename}`,
  }));
});

describe("enqueueDistributionPackages", () => {
  it("cria um pacote PENDENTE para artigo publicado com Página elegível — sem chamar IA nenhuma", async () => {
    db.article.findMany.mockResolvedValue([{ id: "article-1", userId: "user-1", wpSiteId: "site-1" }]);
    findEligiblePages.mockResolvedValue([{ id: "page-1", nome: "Página" }]);
    db.distributionPackage.create.mockResolvedValue({ id: "pkg-1" });

    const criados = await enqueueDistributionPackages(noopLog);

    expect(criados).toBe(1);
    expect(db.distributionPackage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-1", articleId: "article-1", tipo: "CAPTACAO", status: "PENDENTE" }),
      })
    );
    expect(generateDistributionCopy).not.toHaveBeenCalled();
  });

  it("cria pacote mesmo SEM Página, quando existe perfil de divulgação ativo (o pacote serve à fila manual)", async () => {
    db.article.findMany.mockResolvedValue([{ id: "article-1", userId: "user-1", wpSiteId: "site-1" }]);
    findEligiblePages.mockResolvedValue([]);
    db.divulgacaoPerfil.count.mockResolvedValue(2);
    db.distributionPackage.create.mockResolvedValue({ id: "pkg-1" });

    await expect(enqueueDistributionPackages(noopLog)).resolves.toBe(1);
  });

  it("não cria pacote (nem gasta IA) quando não há Página nem perfil ativo — não teria para onde ir", async () => {
    db.article.findMany.mockResolvedValue([{ id: "article-1", userId: "user-1", wpSiteId: "site-1" }]);
    findEligiblePages.mockResolvedValue([]);
    db.divulgacaoPerfil.count.mockResolvedValue(0);

    const criados = await enqueueDistributionPackages(noopLog);

    expect(criados).toBe(0);
    expect(db.distributionPackage.create).not.toHaveBeenCalled();
  });

  it("conta perfis ativos uma vez só por usuário, mesmo com vários artigos no lote", async () => {
    db.article.findMany.mockResolvedValue([
      { id: "article-1", userId: "user-1", wpSiteId: "site-1" },
      { id: "article-2", userId: "user-1", wpSiteId: "site-1" },
      { id: "article-3", userId: "user-1", wpSiteId: "site-1" },
    ]);
    findEligiblePages.mockResolvedValue([]);
    db.divulgacaoPerfil.count.mockResolvedValue(0);

    await enqueueDistributionPackages(noopLog);

    expect(db.divulgacaoPerfil.count).toHaveBeenCalledTimes(1);
  });

  it("só considera artigos PUBLICADO, com URL pública e ainda sem pacote de captação", async () => {
    db.article.findMany.mockResolvedValue([]);

    await enqueueDistributionPackages(noopLog);

    const { where } = db.article.findMany.mock.calls[0]![0] as {
      where: { status: string; wpUrl: unknown; publishedAt: { gte: Date }; distributionPackages: unknown };
    };
    expect(where.status).toBe("PUBLICADO");
    expect(where.wpUrl).toEqual({ not: null });
    expect(where.distributionPackages).toEqual({ none: { tipo: "CAPTACAO" } });
    // Janela de recência: impede que o primeiro deploy varra todo o histórico.
    expect(where.publishedAt.gte.getTime()).toBeLessThan(Date.now());
  });

  it("trata a colisão de unique (outra réplica criou o mesmo pacote) como resultado normal, não como erro", async () => {
    db.article.findMany.mockResolvedValue([
      { id: "article-1", userId: "user-1", wpSiteId: "site-1" },
      { id: "article-2", userId: "user-1", wpSiteId: "site-1" },
    ]);
    findEligiblePages.mockResolvedValue([{ id: "page-1", nome: "Página" }]);
    db.distributionPackage.create
      .mockRejectedValueOnce(new FakeKnownRequestError("unique violation", "P2002"))
      .mockResolvedValueOnce({ id: "pkg-2" });

    await expect(enqueueDistributionPackages(noopLog)).resolves.toBe(1);
  });
});

describe("buildDistributionPackage", () => {
  function setUpPackage(
    packageOverrides: Record<string, unknown> = {},
    articleOverrides: Partial<typeof BASE_ARTICLE> = {}
  ) {
    db.distributionPackage.findUnique.mockResolvedValue({
      id: "pkg-1",
      userId: "user-1",
      tipo: "CAPTACAO",
      status: "PENDENTE",
      tentativas: 0,
      imagensAlvo: 1,
      article: { ...BASE_ARTICLE, ...articleOverrides },
      ...packageOverrides,
    });
  }

  it("gera a copy, anexa o link ao comentário e agenda uma publicação por Página", async () => {
    setUpPackage();
    findEligiblePages.mockResolvedValue([
      { id: "page-1", nome: "Página A" },
      { id: "page-2", nome: "Página B" },
    ]);

    await buildDistributionPackage(fakeRedis as never, "pkg-1", noopLog);

    const data = updateData();
    expect(data.status).toBe("PRONTO");
    expect(data.linkDestino).toBe("https://blog.test/bolo-de-cenoura");
    expect(data.imagens).toEqual(["https://blog.test/wp-content/bolo.jpg"]);

    // A descrição sai exatamente como o modelo escreveu (o link NÃO vai nela).
    expect(data.copyDescricao).toBe(COPY_A.copyDescricao);
    expect(data.copyDescricao).not.toContain("https://");
    // O link é anexado ao comentário pelo código, não escrito pelo modelo.
    expect(data.copyComentario).toBe(`${COPY_A.copyComentario}\n\nhttps://blog.test/bolo-de-cenoura`);

    const [createArgs] = db.pageDistributionPost.createMany.mock.calls[0] as [
      { data: Array<{ facebookPageId: string; status: string; scheduledFor: Date }>; skipDuplicates: boolean },
    ];
    expect(createArgs.data.map((d) => d.facebookPageId)).toEqual(["page-1", "page-2"]);
    expect(createArgs.skipDuplicates).toBe(true);
  });

  it("guarda as variações CRUAS (sem link) para poder trocar a ativa depois", async () => {
    setUpPackage();
    findEligiblePages.mockResolvedValue([{ id: "page-1", nome: "A" }]);

    await buildDistributionPackage(fakeRedis as never, "pkg-1", noopLog);

    const variacoes = updateData().copyVariacoes as typeof COPY_A[];
    expect(variacoes).toHaveLength(2);
    expect(variacoes[0]!.copyComentario).toBe(COPY_A.copyComentario);
    expect(variacoes[0]!.copyComentario).not.toContain("https://");
    expect(variacoes[1]!.palavraChave).toBe("ENVIA");
  });

  it("pede mais de uma variação de copy numa única chamada de IA", async () => {
    setUpPackage();
    findEligiblePages.mockResolvedValue([{ id: "page-1", nome: "A" }]);

    await buildDistributionPackage(fakeRedis as never, "pkg-1", noopLog);

    const [input] = generateDistributionCopy.mock.calls[0] as [{ quantidade: number; tipoPacote: string }];
    expect(input.quantidade).toBeGreaterThan(1);
    expect(input.tipoPacote).toBe("CAPTACAO");
  });

  it("monta pacote normalmente sem nenhuma Página, desde que exista perfil ativo (fila manual)", async () => {
    setUpPackage();
    findEligiblePages.mockResolvedValue([]);
    db.divulgacaoPerfil.count.mockResolvedValue(1);

    await buildDistributionPackage(fakeRedis as never, "pkg-1", noopLog);

    expect(updateData().status).toBe("PRONTO");
    const [createArgs] = db.pageDistributionPost.createMany.mock.calls[0] as [{ data: unknown[] }];
    expect(createArgs.data).toEqual([]);
  });

  it("falha quando não há Página nem perfil ativo — o pacote não teria destino", async () => {
    setUpPackage();
    findEligiblePages.mockResolvedValue([]);
    db.divulgacaoPerfil.count.mockResolvedValue(0);
    db.distributionPackage.findUnique.mockResolvedValueOnce({
      id: "pkg-1",
      userId: "user-1",
      tipo: "CAPTACAO",
      status: "PENDENTE",
      tentativas: 0,
      imagensAlvo: 1,
      article: BASE_ARTICLE,
    });
    db.distributionPackage.findUnique.mockResolvedValueOnce({ tentativas: 0 });

    await buildDistributionPackage(fakeRedis as never, "pkg-1", noopLog);

    expect(generateDistributionCopy).not.toHaveBeenCalled();
    expect(updateData().erroMsg).toMatch(/Nenhuma Página do Facebook válida nem perfil/);
  });

  it("DIRETO_SITE aponta para a página de busca do blog pelo tema, não para o artigo", async () => {
    setUpPackage({ tipo: "DIRETO_SITE" });
    findEligiblePages.mockResolvedValue([{ id: "page-1", nome: "A" }]);

    await buildDistributionPackage(fakeRedis as never, "pkg-1", noopLog);

    const data = updateData();
    expect(data.linkDestino).toBe("https://blog.test/?s=receitas%20f%C3%A1ceis");
    expect(data.copyComentario).toContain("https://blog.test/?s=receitas%20f%C3%A1ceis");
  });

  it("álbum: gera as imagens que faltam e sobe cada uma como mídia no WordPress (URL pública)", async () => {
    setUpPackage({ imagensAlvo: 3 });
    findEligiblePages.mockResolvedValue([{ id: "page-1", nome: "A" }]);

    await buildDistributionPackage(fakeRedis as never, "pkg-1", noopLog);

    // 1 imagem já vinha do artigo; só as 2 que faltavam foram geradas.
    expect(generateImage).toHaveBeenCalledTimes(2);
    expect(uploadMedia).toHaveBeenCalledTimes(2);
    expect(updateData().imagens).toEqual([
      "https://blog.test/wp-content/bolo.jpg",
      "https://blog.test/wp-content/bolo-de-cenoura-divulgacao-2.png",
      "https://blog.test/wp-content/bolo-de-cenoura-divulgacao-3.png",
    ]);
  });

  it("álbum: varia o enquadramento entre as imagens em vez de repetir o mesmo prompt", async () => {
    setUpPackage({ imagensAlvo: 3 });
    findEligiblePages.mockResolvedValue([{ id: "page-1", nome: "A" }]);

    await buildDistributionPackage(fakeRedis as never, "pkg-1", noopLog);

    const prompts = generateImage.mock.calls.map(([input]) => (input as { prompt: string }).prompt);
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it("álbum: uma imagem que falha não derruba o pacote — fica o que deu certo", async () => {
    setUpPackage({ imagensAlvo: 3 });
    findEligiblePages.mockResolvedValue([{ id: "page-1", nome: "A" }]);
    generateImage.mockRejectedValueOnce(new Error("modelo recusou o prompt"));

    await buildDistributionPackage(fakeRedis as never, "pkg-1", noopLog);

    expect(updateData().status).toBe("PRONTO");
    expect(updateData().imagens).toEqual(["https://blog.test/wp-content/bolo.jpg"]);
  });

  it("imagensAlvo padrão (1) reaproveita a imagem do artigo sem gastar IA de imagem", async () => {
    setUpPackage({ imagensAlvo: 1 });
    findEligiblePages.mockResolvedValue([{ id: "page-1", nome: "A" }]);

    await buildDistributionPackage(fakeRedis as never, "pkg-1", noopLog);

    expect(generateImage).not.toHaveBeenCalled();
    expect(uploadMedia).not.toHaveBeenCalled();
  });

  it("artigo sem imagem destacada gera uma imagem própria — post com foto rende muito mais que post de link", async () => {
    setUpPackage({ imagensAlvo: 1 }, { imageUrl: null as unknown as string });
    findEligiblePages.mockResolvedValue([{ id: "page-1", nome: "A" }]);

    await buildDistributionPackage(fakeRedis as never, "pkg-1", noopLog);

    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(updateData().imagens).toEqual(["https://blog.test/wp-content/bolo-de-cenoura-divulgacao-1.png"]);
  });

  it("sem imagem no artigo E sem chave de imagem, o pacote fica sem imagem (o pipeline cai para post de link)", async () => {
    setUpPackage({ imagensAlvo: 1 }, { imageUrl: null as unknown as string });
    findEligiblePages.mockResolvedValue([{ id: "page-1", nome: "A" }]);
    // 1ª chamada = chave de texto (ok); 2ª = chave de imagem (ausente).
    getDecryptedApiKey.mockResolvedValueOnce("fake-key").mockResolvedValueOnce(null as unknown as string);

    await buildDistributionPackage(fakeRedis as never, "pkg-1", noopLog);

    expect(generateImage).not.toHaveBeenCalled();
    expect(updateData().status).toBe("PRONTO");
    expect(updateData().imagens).toEqual([]);
  });

  it("espaça as publicações do mesmo pacote em vez de disparar todas no mesmo instante", async () => {
    setUpPackage();
    findEligiblePages.mockResolvedValue([
      { id: "page-1", nome: "A" },
      { id: "page-2", nome: "B" },
      { id: "page-3", nome: "C" },
    ]);

    await buildDistributionPackage(fakeRedis as never, "pkg-1", noopLog);

    const [createArgs] = db.pageDistributionPost.createMany.mock.calls[0] as [{ data: Array<{ scheduledFor: Date }> }];
    const horarios = createArgs.data.map((d) => d.scheduledFor.getTime());
    expect(horarios[0]).toBeGreaterThan(Date.now());
    expect(horarios[1]).toBeGreaterThan(horarios[0]!);
    expect(horarios[2]).toBeGreaterThan(horarios[1]!);
  });

  it("rate limit do provedor deixa o pacote PENDENTE e NÃO consome tentativa", async () => {
    setUpPackage();
    findEligiblePages.mockResolvedValue([{ id: "page-1", nome: "A" }]);
    const { AiProviderError } = await import("@wordbee/shared");
    generateDistributionCopy.mockRejectedValue(new AiProviderError("rate_limit", "openrouter"));

    await buildDistributionPackage(fakeRedis as never, "pkg-1", noopLog);

    expect(db.distributionPackage.update).not.toHaveBeenCalled();
    expect(db.pageDistributionPost.createMany).not.toHaveBeenCalled();
  });

  it("rate limit na geração de imagem do álbum também adia o pacote inteiro", async () => {
    setUpPackage({ imagensAlvo: 3 });
    findEligiblePages.mockResolvedValue([{ id: "page-1", nome: "A" }]);
    const { AiProviderError } = await import("@wordbee/shared");
    generateImage.mockRejectedValue(new AiProviderError("rate_limit", "openrouter"));

    await buildDistributionPackage(fakeRedis as never, "pkg-1", noopLog);

    expect(db.distributionPackage.update).not.toHaveBeenCalled();
  });

  it("erro determinístico conta tentativa e só marca FALHA ao esgotar o limite", async () => {
    findEligiblePages.mockResolvedValue([{ id: "page-1", nome: "A" }]);
    const { AiProviderError } = await import("@wordbee/shared");
    generateDistributionCopy.mockRejectedValue(new AiProviderError("invalid_key", "openrouter"));

    db.distributionPackage.findUnique
      .mockResolvedValueOnce({ id: "pkg-1", userId: "user-1", tipo: "CAPTACAO", status: "PENDENTE", tentativas: 0, imagensAlvo: 1, article: BASE_ARTICLE })
      .mockResolvedValueOnce({ tentativas: 0 });
    await buildDistributionPackage(fakeRedis as never, "pkg-1", noopLog);
    expect(updateData().tentativas).toBe(1);
    expect(updateData().status).toBeUndefined();

    vi.clearAllMocks();
    db.distributionPackage.update.mockResolvedValue({});
    db.divulgacaoPerfil.count.mockResolvedValue(0);
    generateDistributionCopy.mockRejectedValue(new AiProviderError("invalid_key", "openrouter"));
    db.distributionPackage.findUnique
      .mockResolvedValueOnce({ id: "pkg-1", userId: "user-1", tipo: "CAPTACAO", status: "PENDENTE", tentativas: 2, imagensAlvo: 1, article: BASE_ARTICLE })
      .mockResolvedValueOnce({ tentativas: 2 });
    await buildDistributionPackage(fakeRedis as never, "pkg-1", noopLog);
    expect(updateData().tentativas).toBe(3);
    expect(updateData().status).toBe("FALHA");
  });

  it("sem chave de IA de texto configurada, registra a falha sem tentar chamar o provedor", async () => {
    findEligiblePages.mockResolvedValue([{ id: "page-1", nome: "A" }]);
    getDecryptedApiKey.mockResolvedValueOnce(null as unknown as string);
    db.distributionPackage.findUnique
      .mockResolvedValueOnce({ id: "pkg-1", userId: "user-1", tipo: "CAPTACAO", status: "PENDENTE", tentativas: 0, imagensAlvo: 1, article: BASE_ARTICLE })
      .mockResolvedValueOnce({ tentativas: 0 });

    await buildDistributionPackage(fakeRedis as never, "pkg-1", noopLog);

    expect(generateDistributionCopy).not.toHaveBeenCalled();
    expect(updateData().erroMsg).toMatch(/Chave de IA de texto não configurada/);
  });

  it("não faz nada com pacote que já saiu de PENDENTE (proteção contra reprocessamento)", async () => {
    setUpPackage({ status: "PRONTO" });

    await buildDistributionPackage(fakeRedis as never, "pkg-1", noopLog);

    expect(generateDistributionCopy).not.toHaveBeenCalled();
    expect(db.distributionPackage.update).not.toHaveBeenCalled();
  });
});
