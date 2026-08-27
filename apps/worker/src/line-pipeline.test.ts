import { describe, it, expect, vi, beforeEach } from "vitest";

const generateTitles = vi.fn();
const generateArticle = vi.fn();
const generateImage = vi.fn();
const uploadMedia = vi.fn();
const createPost = vi.fn();
const scheduleLineRun = vi.fn();

vi.mock("@wordbee/shared", async () => {
  const actual = await vi.importActual<typeof import("@wordbee/shared")>("@wordbee/shared");
  return {
    ...actual,
    createTextProvider: vi.fn(() => ({ generateTitles, generateArticle })),
    createImageProvider: vi.fn(() => ({ generateImage })),
    uploadMedia,
    createPost,
    scheduleLineRun,
    getStorageDriver: vi.fn(() => ({ read: vi.fn(), save: vi.fn(), delete: vi.fn(), publicUrl: vi.fn() })),
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

const fakeRedis = { incr: vi.fn(async () => 1), decr: vi.fn(async () => 0), expire: vi.fn(async () => 1) };

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
    // O reagendamento na fila do BullMQ acontece no handler "completed" do
    // worker (production-line-worker.ts), nunca de dentro do processor —
    // ver DECISIONS.md.
    expect(scheduleLineRun).not.toHaveBeenCalled();
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
    expect(scheduleLineRun).not.toHaveBeenCalled();
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
    expect(scheduleLineRun).not.toHaveBeenCalled();
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
    expect(scheduleLineRun).not.toHaveBeenCalled();
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
    expect(scheduleLineRun).not.toHaveBeenCalled();
  });
});

describe("runProductionLine — rede de segurança contra exceção inesperada", () => {
  it("erro fora do try/catch dos providers (ex.: getDecryptedApiKey lançando de verdade) nunca escapa: registra falha genérica e não chama scheduleLineRun", async () => {
    db.productionLine.findUnique.mockResolvedValue({ ...BASE_LINE, consecutiveFailures: 1 });
    db.titleQueueItem.findFirst.mockResolvedValue(null);
    getDecryptedApiKey.mockRejectedValueOnce(new Error("Postgres indisponível"));

    // A garantia central: o BullMQ NUNCA pode ver esse job como "failed" —
    // isso deixaria um job morto ocupando jobId=lineId pra sempre (ver
    // DECISIONS.md). runProductionLine precisa resolver normalmente mesmo
    // diante de um erro totalmente inesperado.
    await expect(runProductionLine(fakeRedis as never, "line-1", noopLog)).resolves.toBeUndefined();

    expect(db.productionLine.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ consecutiveFailures: 2 }) })
    );
    expect(scheduleLineRun).not.toHaveBeenCalled();
  });

  it("se até a releitura da linha no catch falhar (Postgres realmente fora do ar), ainda assim resolve sem lançar", async () => {
    db.productionLine.findUnique.mockResolvedValueOnce({ ...BASE_LINE }).mockRejectedValueOnce(new Error("Postgres indisponível"));
    db.titleQueueItem.findFirst.mockResolvedValue(null);
    getDecryptedApiKey.mockRejectedValueOnce(new Error("timeout de rede"));

    await expect(runProductionLine(fakeRedis as never, "line-1", noopLog)).resolves.toBeUndefined();

    expect(scheduleLineRun).not.toHaveBeenCalled();
  });
});
