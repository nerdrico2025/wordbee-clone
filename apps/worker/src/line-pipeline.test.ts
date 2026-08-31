import { describe, it, expect, vi, beforeEach } from "vitest";

const generateTitles = vi.fn();
const generateArticle = vi.fn();
const generateImage = vi.fn();
const uploadMedia = vi.fn();
const createPost = vi.fn();

const storageRead = vi.fn();

vi.mock("@wordbee/shared", async () => {
  const actual = await vi.importActual<typeof import("@wordbee/shared")>("@wordbee/shared");
  return {
    ...actual,
    createTextProvider: vi.fn(() => ({ generateTitles, generateArticle })),
    createImageProvider: vi.fn(() => ({ generateImage })),
    uploadMedia,
    createPost,
    getStorageDriver: vi.fn(() => ({ read: storageRead, save: vi.fn(), delete: vi.fn(), publicUrl: vi.fn() })),
  };
});

const getDecryptedApiKey = vi.fn(async () => "fake-key");
vi.mock("./api-keys.js", () => ({ getDecryptedApiKey }));

vi.mock("./wp-sites.js", () => ({
  getSiteCredentials: vi.fn(async () => ({ url: "https://blog.test", usuario: "admin", appPassword: "xxxx" })),
}));

const db = {
  productionLine: { findUnique: vi.fn(), update: vi.fn() },
  titleQueueItem: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  article: { findUnique: vi.fn(), create: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  lineReferenceImage: { findMany: vi.fn() },
};

vi.mock("@wordbee/db", () => ({ prisma: db }));

const { runProductionLine } = await import("./line-pipeline.js");
const { AiProviderError } = await import("@wordbee/shared");

const BASE_LINE = {
  id: "line-1",
  userId: "user-1",
  wpSiteId: "site-1",
  nome: "Linha de teste",
  categoriaWpId: null,
  iaTexto: "GEMINI",
  iaImagem: "GEMINI",
  tipoArtigo: "TUTORIAL",
  temas: ["Tema A", "Tema B"],
  intervaloMin: 10,
  maxArtigos: null as number | null,
  geradosCount: 0,
  statusWp: "PUBLISH",
  promptCustomizado: null,
  status: "ATIVA",
  pauseReason: null,
  rateLimitBehavior: "ADIAR",
  consecutiveFailures: 0,
  nextRunAt: new Date(),
  lastRunAt: null,
};

const fakeRedis = { eval: vi.fn(async () => 1), decr: vi.fn(async () => 0) };

function noopLog() {
  /* silencia logs nos testes */
}

beforeEach(() => {
  vi.clearAllMocks();
  db.titleQueueItem.count.mockResolvedValue(0);
  db.titleQueueItem.findMany.mockResolvedValue([]);
  db.article.findMany.mockResolvedValue([]);
  db.lineReferenceImage.findMany.mockResolvedValue([]);
  generateTitles.mockResolvedValue(["Título gerado pela IA"]);
});

describe("runProductionLine — imagens de referência", () => {
  function setUpArticleForImageGeneration() {
    db.titleQueueItem.findFirst.mockResolvedValue(null);
    db.article.findUnique.mockResolvedValue(null);
    db.article.create.mockResolvedValue({ id: "article-1" });
    db.article.findUniqueOrThrow.mockResolvedValue({
      id: "article-1",
      contentHtml: "<p>já gerado</p>",
      excerpt: "resumo",
      slug: "titulo",
      titulo: "Título gerado pela IA",
      wpMediaId: null,
    });
    generateImage.mockResolvedValue({ base64: "AAAA", mimeType: "image/png" });
    uploadMedia.mockResolvedValue({ id: 42, sourceUrl: "https://blog.test/img.png" });
    createPost.mockResolvedValue({ id: 99, link: "https://blog.test/post" });
    db.lineReferenceImage.findMany.mockResolvedValue([
      { id: "ref-1", lineId: "line-1", storageUrl: "/api/uploads/ref1.jpg", ordem: 0, createdAt: new Date() },
    ]);
    storageRead.mockResolvedValue(Buffer.from("fake-image-bytes"));
  }

  it("iaImagem=OPENROUTER: carrega e envia as imagens de referência cadastradas (registry declara suportaImagensReferencia)", async () => {
    db.productionLine.findUnique.mockResolvedValue({ ...BASE_LINE, iaImagem: "OPENROUTER" });
    setUpArticleForImageGeneration();

    await runProductionLine(fakeRedis as never, "line-1", noopLog);

    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(storageRead).toHaveBeenCalledTimes(1);
    const [{ referenceImages }] = generateImage.mock.calls[0] as [{ referenceImages?: { base64: string; mimeType: string }[] }];
    expect(referenceImages).toHaveLength(1);
    expect(referenceImages![0]).toEqual({ base64: Buffer.from("fake-image-bytes").toString("base64"), mimeType: "image/jpeg" });
  });

  it("iaImagem=OPENAI (sem suporte a imagens de referência no registry): não carrega do storage e envia referenceImages undefined", async () => {
    db.productionLine.findUnique.mockResolvedValue({ ...BASE_LINE, iaImagem: "OPENAI" });
    setUpArticleForImageGeneration();

    await runProductionLine(fakeRedis as never, "line-1", noopLog);

    expect(generateImage).toHaveBeenCalledTimes(1);
    const [{ referenceImages }] = generateImage.mock.calls[0] as [{ referenceImages?: unknown[] }];
    expect(referenceImages).toBeUndefined();
    expect(storageRead).not.toHaveBeenCalled();
  });

  it("iaImagem=GEMINI: continua carregando e enviando as imagens de referência (comportamento anterior preservado)", async () => {
    db.productionLine.findUnique.mockResolvedValue({ ...BASE_LINE, iaImagem: "GEMINI" });
    setUpArticleForImageGeneration();

    await runProductionLine(fakeRedis as never, "line-1", noopLog);

    expect(generateImage).toHaveBeenCalledTimes(1);
    const [{ referenceImages }] = generateImage.mock.calls[0] as [{ referenceImages?: unknown[] }];
    expect(referenceImages).toHaveLength(1);
    expect(referenceImages![0]).toMatchObject({ mimeType: "image/jpeg" });
  });
});

describe("runProductionLine — máximo atingido", () => {
  it("pausa a linha como CONCLUIDA e não chama nenhuma IA quando geradosCount já atingiu maxArtigos", async () => {
    db.productionLine.findUnique.mockResolvedValue({ ...BASE_LINE, maxArtigos: 5, geradosCount: 5 });

    await runProductionLine(fakeRedis as never, "line-1", noopLog);

    expect(db.productionLine.update).toHaveBeenCalledWith({
      where: { id: "line-1" },
      data: { status: "CONCLUIDA", pauseReason: "Máximo de artigos atingido." },
    });
    expect(generateTitles).not.toHaveBeenCalled();
    expect(generateArticle).not.toHaveBeenCalled();
  });
});

describe("runProductionLine — rate limit", () => {
  it("com rateLimitBehavior=ADIAR, adia o próximo disparo sem contar como falha", async () => {
    db.productionLine.findUnique.mockResolvedValue({ ...BASE_LINE, rateLimitBehavior: "ADIAR" });
    db.titleQueueItem.findFirst.mockResolvedValue(null);
    generateTitles.mockRejectedValue(new AiProviderError("rate_limit", "gemini"));

    await runProductionLine(fakeRedis as never, "line-1", noopLog);

    const updateCalls = db.productionLine.update.mock.calls.map((c: unknown[]) => c[0]);
    const finalUpdate = updateCalls.at(-1) as { data: Record<string, unknown> };
    expect(finalUpdate.data.status).toBeUndefined();
    expect(finalUpdate.data.nextRunAt).toBeInstanceOf(Date);
  });

  it("com rateLimitBehavior=PAUSAR, pausa a linha imediatamente", async () => {
    db.productionLine.findUnique.mockResolvedValue({ ...BASE_LINE, rateLimitBehavior: "PAUSAR" });
    db.titleQueueItem.findFirst.mockResolvedValue(null);
    generateTitles.mockRejectedValue(new AiProviderError("rate_limit", "gemini"));

    await runProductionLine(fakeRedis as never, "line-1", noopLog);

    expect(db.productionLine.update).toHaveBeenCalledWith({
      where: { id: "line-1" },
      data: { status: "PAUSADA", pauseReason: "Pausada: limite de uso do provedor de IA atingido." },
    });
  });
});

describe("runProductionLine — falha e retry", () => {
  it("tenta de novo após falha determinística e publica com sucesso na 3ª tentativa", async () => {
    db.productionLine.findUnique.mockResolvedValue({ ...BASE_LINE });
    db.titleQueueItem.findFirst.mockResolvedValue(null);
    db.article.findUnique.mockResolvedValue(null);
    db.article.create.mockResolvedValue({ id: "article-1" });
    db.article.findUniqueOrThrow.mockResolvedValue({ id: "article-1", contentHtml: null, excerpt: null, slug: null, titulo: "Título gerado pela IA", wpMediaId: null });

    generateArticle
      .mockRejectedValueOnce(new Error("erro transitório 1"))
      .mockRejectedValueOnce(new Error("erro transitório 2"))
      .mockResolvedValueOnce({ contentHtml: "<p>ok</p>", excerpt: "resumo", slug: "titulo", metaTitle: "Título Final" });
    generateImage.mockResolvedValue({ base64: "AAAA", mimeType: "image/png" });
    uploadMedia.mockResolvedValue({ id: 42, sourceUrl: "https://blog.test/img.png" });
    createPost.mockResolvedValue({ id: 99, link: "https://blog.test/post" });

    await runProductionLine(fakeRedis as never, "line-1", noopLog);

    expect(generateArticle).toHaveBeenCalledTimes(3);
    expect(createPost).toHaveBeenCalledTimes(1);
    const successUpdate = db.article.update.mock.calls.find((c: unknown[]) => (c[0] as { data: Record<string, unknown> }).data.status === "PUBLICADO");
    expect(successUpdate).toBeTruthy();
  }, 15_000);

  it("após esgotar as 3 tentativas, marca o artigo como FALHA e incrementa consecutiveFailures", async () => {
    db.productionLine.findUnique.mockResolvedValue({ ...BASE_LINE, consecutiveFailures: 1 });
    db.titleQueueItem.findFirst.mockResolvedValue(null);
    db.article.findUnique.mockResolvedValue(null);
    db.article.create.mockResolvedValue({ id: "article-2" });
    db.article.findUniqueOrThrow.mockResolvedValue({ id: "article-2", contentHtml: null, excerpt: null, slug: null, titulo: "Título gerado pela IA", wpMediaId: null });

    generateArticle.mockRejectedValue(new Error("sempre falha"));

    await runProductionLine(fakeRedis as never, "line-1", noopLog);

    expect(generateArticle).toHaveBeenCalledTimes(3);
    expect(db.article.update).toHaveBeenCalledWith({
      where: { id: "article-2" },
      data: { status: "FALHA", erroMsg: "sempre falha" },
    });
    expect(db.productionLine.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ consecutiveFailures: 2 }) })
    );
  }, 15_000);

  it("pausa a linha após atingir 5 falhas consecutivas", async () => {
    db.productionLine.findUnique.mockResolvedValue({ ...BASE_LINE, consecutiveFailures: 4 });
    db.titleQueueItem.findFirst.mockResolvedValue(null);
    db.article.findUnique.mockResolvedValue(null);
    db.article.create.mockResolvedValue({ id: "article-3" });
    db.article.findUniqueOrThrow.mockResolvedValue({ id: "article-3", contentHtml: null, excerpt: null, slug: null, titulo: "Título gerado pela IA", wpMediaId: null });

    generateArticle.mockRejectedValue(new Error("falha final"));

    await runProductionLine(fakeRedis as never, "line-1", noopLog);

    expect(db.productionLine.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PAUSADA", consecutiveFailures: 5 }) })
    );
  }, 15_000);
});

describe("runProductionLine — idempotência / duplicidade", () => {
  it("não gera nem publica de novo se já existe um artigo não-FALHA com a mesma idempotencyKey", async () => {
    db.productionLine.findUnique.mockResolvedValue({ ...BASE_LINE });
    db.titleQueueItem.findFirst.mockResolvedValue({ id: "title-1", titulo: "Título já na fila", previstoPara: new Date() });
    db.article.findUnique.mockResolvedValue({ id: "article-existente", status: "PUBLICADO" });

    await runProductionLine(fakeRedis as never, "line-1", noopLog);

    expect(db.article.create).not.toHaveBeenCalled();
    expect(generateArticle).not.toHaveBeenCalled();
    expect(createPost).not.toHaveBeenCalled();
  });
});

describe("runProductionLine — rede de segurança contra exceção inesperada", () => {
  it("erro fora do try/catch dos providers (ex.: getDecryptedApiKey lançando de verdade) nunca escapa: registra falha genérica", async () => {
    db.productionLine.findUnique.mockResolvedValue({ ...BASE_LINE, consecutiveFailures: 1 });
    db.titleQueueItem.findFirst.mockResolvedValue(null);
    getDecryptedApiKey.mockRejectedValueOnce(new Error("Postgres indisponível"));

    // A garantia central: um erro totalmente inesperado nunca pode escapar
    // de runProductionLine — o scheduler cron+Postgres precisa liberar o
    // lock da linha (`releaseLine`, no `finally` de `line-scheduler.ts`)
    // não importa o que aconteça aqui dentro; se isso lançasse, a linha
    // ficaria travada (locked_at preso) até o timeout de lock morto. Ver
    // DECISIONS.md.
    await expect(runProductionLine(fakeRedis as never, "line-1", noopLog)).resolves.toBeUndefined();

    expect(db.productionLine.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ consecutiveFailures: 2 }) })
    );
  });

  it("se até a releitura da linha no catch falhar (Postgres realmente fora do ar), ainda assim resolve sem lançar", async () => {
    db.productionLine.findUnique.mockResolvedValueOnce({ ...BASE_LINE }).mockRejectedValueOnce(new Error("Postgres indisponível"));
    db.titleQueueItem.findFirst.mockResolvedValue(null);
    getDecryptedApiKey.mockRejectedValueOnce(new Error("timeout de rede"));

    await expect(runProductionLine(fakeRedis as never, "line-1", noopLog)).resolves.toBeUndefined();
  });
});
