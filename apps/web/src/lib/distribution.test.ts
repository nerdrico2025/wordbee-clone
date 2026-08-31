import { describe, it, expect, beforeEach, vi } from "vitest";

// "server-only" lança sempre que importado fora do bundler do Next.js —
// precisa ser mockado para o arquivo carregar sob vitest/node (mesmo
// tratamento já usado em api-keys.test.ts).
vi.mock("server-only", () => ({}));

const headersMock = vi.fn(() => new Map<string, string>());
vi.mock("next/headers", () => ({ headers: () => headersMock() }));

/** Classe mínima que reproduz o formato de erro do Prisma que o código inspeciona. */
class FakeKnownRequestError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

const db = {
  article: { count: vi.fn() },
  distributionPackage: { findFirst: vi.fn(), update: vi.fn() },
  divulgacaoPerfil: { findMany: vi.fn() },
  grupoParceiro: { findMany: vi.fn() },
  perfilGrupo: { findMany: vi.fn() },
  filaDistribuicaoManual: { create: vi.fn() },
  distributionLink: { findFirst: vi.fn(), create: vi.fn() },
};

vi.mock("@wordbee/db", () => ({
  prisma: db,
  Prisma: { PrismaClientKnownRequestError: FakeKnownRequestError },
}));

const {
  hojeIsoDate,
  toDataPrevista,
  fromDataPrevista,
  resolveAppBaseUrl,
  contarArtigosNoTema,
  diretoSiteRecomendado,
  lerVariacoes,
  aplicarVariacaoDeCopy,
  obterOuCriarLink,
  copyComentarioComLinkCurto,
  enfileirarCombinacoes,
} = await import("./distribution.js");

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.APP_PUBLIC_URL;
  headersMock.mockReturnValue(new Map<string, string>());
});

describe("hojeIsoDate", () => {
  it("usa o fuso do usuário, não o do servidor — 21h de Brasília ainda é hoje, não amanhã", () => {
    // 2026-09-02T00:30:00Z = 2026-09-01 21:30 em São Paulo.
    const instante = new Date("2026-09-02T00:30:00.000Z");
    expect(hojeIsoDate(instante, "America/Sao_Paulo")).toBe("2026-09-01");
    expect(hojeIsoDate(instante, "UTC")).toBe("2026-09-02");
  });

  it("devolve no formato que o <input type=date> e a query string usam", () => {
    expect(hojeIsoDate(new Date("2026-03-07T12:00:00.000Z"), "America/Sao_Paulo")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("toDataPrevista / fromDataPrevista", () => {
  it("grava o dia como meia-noite UTC (rótulo de dia, não instante)", () => {
    expect(toDataPrevista("2026-09-01").toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("faz o caminho de volta sem perder o dia", () => {
    for (const dia of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
      expect(fromDataPrevista(toDataPrevista(dia))).toBe(dia);
    }
  });
});

describe("resolveAppBaseUrl", () => {
  it("prefere APP_PUBLIC_URL e remove a barra final", () => {
    process.env.APP_PUBLIC_URL = "https://app.exemplo.com/";
    expect(resolveAppBaseUrl()).toBe("https://app.exemplo.com");
  });

  it("sem env, deriva dos headers da requisição (faz o link funcionar em localhost sem configurar nada)", () => {
    headersMock.mockReturnValue(new Map([["host", "localhost:3000"]]));
    expect(resolveAppBaseUrl()).toBe("http://localhost:3000");

    headersMock.mockReturnValue(
      new Map([
        ["x-forwarded-host", "wordbee.vercel.app"],
        ["x-forwarded-proto", "https"],
      ])
    );
    expect(resolveAppBaseUrl()).toBe("https://wordbee.vercel.app");
  });
});

describe("contarArtigosNoTema / diretoSiteRecomendado", () => {
  it("compara o tema sem diferenciar maiúsculas — quem escreve não padroniza", async () => {
    db.article.count.mockResolvedValue(4);

    await contarArtigosNoTema("user-1", "site-1", "  Doce de Leite  ");

    const { where } = db.article.count.mock.calls[0]![0] as { where: { tema: { equals: string; mode: string } } };
    expect(where.tema).toEqual({ equals: "Doce de Leite", mode: "insensitive" });
  });

  it("tema vazio conta zero sem consultar o banco", async () => {
    await expect(contarArtigosNoTema("user-1", "site-1", null)).resolves.toBe(0);
    await expect(contarArtigosNoTema("user-1", "site-1", "   ")).resolves.toBe(0);
    expect(db.article.count).not.toHaveBeenCalled();
  });

  it("DIRETO_SITE só é recomendado com conteúdo suficiente no tema", () => {
    expect(diretoSiteRecomendado(0)).toBe(false);
    expect(diretoSiteRecomendado(2)).toBe(false);
    expect(diretoSiteRecomendado(3)).toBe(true);
    expect(diretoSiteRecomendado(10)).toBe(true);
  });
});

describe("lerVariacoes", () => {
  const boa = { copyDescricao: "desc", copyComentario: "com", palavraChave: "QUERO" };

  it("lê o array de variações", () => {
    expect(lerVariacoes([boa, boa] as never)).toHaveLength(2);
  });

  it("tolera null, formato errado e itens quebrados sem derrubar a tela", () => {
    expect(lerVariacoes(null)).toEqual([]);
    expect(lerVariacoes({ nao: "array" } as never)).toEqual([]);
    expect(lerVariacoes([boa, { copyDescricao: 1 }, null, "texto"] as never)).toHaveLength(1);
  });

  it("preenche a palavra-chave ausente em vez de descartar a variação", () => {
    const [variacao] = lerVariacoes([{ copyDescricao: "d", copyComentario: "c" }] as never);
    expect(variacao!.palavraChave).toBe("QUERO");
  });
});

describe("aplicarVariacaoDeCopy", () => {
  const variacoes = [
    { copyDescricao: "Versão 1", copyComentario: "Comentário 1", palavraChave: "QUERO" },
    { copyDescricao: "Versão 2", copyComentario: "Comentário 2", palavraChave: "ENVIA" },
  ];

  it("copia a variação escolhida reanexando o link de destino", async () => {
    db.distributionPackage.findFirst.mockResolvedValue({
      id: "pkg-1",
      copyVariacoes: variacoes,
      linkDestino: "https://blog.test/artigo",
    });

    await aplicarVariacaoDeCopy("user-1", "pkg-1", 1);

    const [args] = db.distributionPackage.update.mock.calls[0] as [{ data: Record<string, string> }];
    expect(args.data.copyDescricao).toBe("Versão 2");
    expect(args.data.copyComentario).toBe("Comentário 2\n\nhttps://blog.test/artigo");
  });

  it("recusa índice que não existe em vez de gravar copy vazia", async () => {
    db.distributionPackage.findFirst.mockResolvedValue({ id: "pkg-1", copyVariacoes: variacoes, linkDestino: null });

    await expect(aplicarVariacaoDeCopy("user-1", "pkg-1", 7)).rejects.toThrow(/Variação de copy não encontrada/);
    expect(db.distributionPackage.update).not.toHaveBeenCalled();
  });
});

describe("obterOuCriarLink", () => {
  const entrada = {
    userId: "user-1",
    packageId: "pkg-1",
    divulgacaoPerfilId: "perfil-1",
    grupoParceiroId: "grupo-1",
    destinoUrl: "https://blog.test/artigo",
  };

  it("reusa o link existente da combinação — senão os cliques ficariam espalhados", async () => {
    db.distributionLink.findFirst.mockResolvedValue({ id: "link-1", code: "aB3dE5f7" });

    const link = await obterOuCriarLink(entrada);

    expect(link.code).toBe("aB3dE5f7");
    expect(db.distributionLink.create).not.toHaveBeenCalled();
  });

  it("cria um link novo com código curto quando a combinação é inédita", async () => {
    db.distributionLink.findFirst.mockResolvedValue(null);
    db.distributionLink.create.mockImplementation(async ({ data }: { data: { code: string } }) => ({ id: "link-2", ...data }));

    const link = await obterOuCriarLink(entrada);

    expect(link.code).toMatch(/^[^0O1lI]{8}$/);
    expect(link.destinoUrl).toBe("https://blog.test/artigo");
  });

  it("na corrida com outra requisição, devolve o link que a outra criou em vez de estourar", async () => {
    db.distributionLink.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "link-3", code: "concorr1" });
    db.distributionLink.create.mockRejectedValueOnce(new FakeKnownRequestError("unique", "P2002"));

    const link = await obterOuCriarLink(entrada);

    expect(link.code).toBe("concorr1");
  });
});

describe("copyComentarioComLinkCurto", () => {
  it("troca o link do pacote pelo link rastreado da combinação", () => {
    const resultado = copyComentarioComLinkCurto(
      "Tá aqui, ó:\n\nhttps://blog.test/artigo",
      "https://blog.test/artigo",
      "https://app.test",
      "aB3dE5f7"
    );
    expect(resultado).toBe("Tá aqui, ó:\n\nhttps://app.test/r/aB3dE5f7");
  });

  it("sem link rastreado, devolve a copy original (nunca um texto quebrado)", () => {
    expect(copyComentarioComLinkCurto("Texto", "https://blog.test/a", "https://app.test", null)).toBe("Texto");
  });

  it("copy ausente vira string vazia", () => {
    expect(copyComentarioComLinkCurto(null, null, "https://app.test", "abc")).toBe("");
  });
});

describe("enfileirarCombinacoes", () => {
  const PACOTE_PRONTO = { id: "pkg-1", status: "PRONTO", linkDestino: "https://blog.test/artigo" };
  const dia = toDataPrevista("2026-09-01");

  function setUp(options: {
    perfis?: Array<{ id: string; nome: string; ativo: boolean }>;
    grupos?: Array<{ id: string; nome: string; status: string }>;
    vinculos?: Array<{ divulgacaoPerfilId: string; grupoParceiroId: string; status: string }>;
  } = {}) {
    db.distributionPackage.findFirst.mockResolvedValue(PACOTE_PRONTO);
    db.divulgacaoPerfil.findMany.mockResolvedValue(options.perfis ?? [{ id: "perfil-1", nome: "Tia Márcia", ativo: true }]);
    db.grupoParceiro.findMany.mockResolvedValue(options.grupos ?? [{ id: "grupo-1", nome: "Receitas BR", status: "ATIVO" }]);
    db.perfilGrupo.findMany.mockResolvedValue(
      options.vinculos ?? [{ divulgacaoPerfilId: "perfil-1", grupoParceiroId: "grupo-1", status: "ENTROU" }]
    );
    db.filaDistribuicaoManual.create.mockResolvedValue({ id: "fila-1" });
    db.distributionLink.findFirst.mockResolvedValue({ id: "link-1", code: "aB3dE5f7" });
  }

  const combo = [{ divulgacaoPerfilId: "perfil-1", grupoParceiroId: "grupo-1" }];

  it("cria o item da fila e o link rastreado da combinação", async () => {
    setUp();

    const resultado = await enfileirarCombinacoes("user-1", "pkg-1", combo, dia);

    expect(resultado.criados).toBe(1);
    expect(resultado.ignorados).toEqual([]);
    const [args] = db.filaDistribuicaoManual.create.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(args.data).toMatchObject({
      userId: "user-1",
      packageId: "pkg-1",
      divulgacaoPerfilId: "perfil-1",
      grupoParceiroId: "grupo-1",
      dataPrevista: dia,
    });
  });

  it("recusa pacote que ainda não está pronto", async () => {
    db.distributionPackage.findFirst.mockResolvedValue({ ...PACOTE_PRONTO, status: "PENDENTE" });
    await expect(enfileirarCombinacoes("user-1", "pkg-1", combo, dia)).rejects.toThrow(/ainda não está pronto/);
  });

  it("ignora perfil inativo, com motivo, em vez de falhar a requisição inteira", async () => {
    setUp({ perfis: [{ id: "perfil-1", nome: "Tia Márcia", ativo: false }] });

    const resultado = await enfileirarCombinacoes("user-1", "pkg-1", combo, dia);

    expect(resultado.criados).toBe(0);
    expect(resultado.ignorados[0]!.motivo).toMatch(/inativo/i);
    expect(db.filaDistribuicaoManual.create).not.toHaveBeenCalled();
  });

  it("ignora grupo cuja parceria não está ativa", async () => {
    setUp({ grupos: [{ id: "grupo-1", nome: "Receitas BR", status: "ENCERRADO" }] });

    const resultado = await enfileirarCombinacoes("user-1", "pkg-1", combo, dia);

    expect(resultado.ignorados[0]!.motivo).toMatch(/não está ativa/i);
  });

  it("não pede que alguém poste num grupo de que ainda não participa", async () => {
    setUp({ vinculos: [{ divulgacaoPerfilId: "perfil-1", grupoParceiroId: "grupo-1", status: "AGUARDANDO_APROVACAO" }] });

    const resultado = await enfileirarCombinacoes("user-1", "pkg-1", combo, dia);

    expect(resultado.criados).toBe(0);
    expect(resultado.ignorados[0]!.motivo).toMatch(/ainda não está dentro do grupo/i);
  });

  it("aceita tanto APROVADO quanto ENTROU como 'está no grupo'", async () => {
    for (const status of ["APROVADO", "ENTROU"]) {
      vi.clearAllMocks();
      setUp({ vinculos: [{ divulgacaoPerfilId: "perfil-1", grupoParceiroId: "grupo-1", status }] });
      const resultado = await enfileirarCombinacoes("user-1", "pkg-1", combo, dia);
      expect(resultado.criados).toBe(1);
    }
  });

  it("não repete o mesmo perfil no mesmo grupo no mesmo dia (a unique do banco é quem garante)", async () => {
    setUp();
    db.filaDistribuicaoManual.create.mockRejectedValue(new FakeKnownRequestError("unique violation", "P2002"));

    const resultado = await enfileirarCombinacoes("user-1", "pkg-1", combo, dia);

    expect(resultado.criados).toBe(0);
    expect(resultado.ignorados[0]!.motivo).toMatch(/já tem uma postagem marcada nesse grupo nesse dia/i);
  });

  it("processa o que é válido e reporta só o que ficou de fora", async () => {
    setUp({
      perfis: [
        { id: "perfil-1", nome: "Tia Márcia", ativo: true },
        { id: "perfil-2", nome: "Primo João", ativo: false },
      ],
      grupos: [{ id: "grupo-1", nome: "Receitas BR", status: "ATIVO" }],
      vinculos: [
        { divulgacaoPerfilId: "perfil-1", grupoParceiroId: "grupo-1", status: "ENTROU" },
        { divulgacaoPerfilId: "perfil-2", grupoParceiroId: "grupo-1", status: "ENTROU" },
      ],
    });

    const resultado = await enfileirarCombinacoes(
      "user-1",
      "pkg-1",
      [
        { divulgacaoPerfilId: "perfil-1", grupoParceiroId: "grupo-1" },
        { divulgacaoPerfilId: "perfil-2", grupoParceiroId: "grupo-1" },
      ],
      dia
    );

    expect(resultado.criados).toBe(1);
    expect(resultado.ignorados).toHaveLength(1);
    expect(resultado.ignorados[0]!.perfilNome).toBe("Primo João");
  });
});
