import { describe, it, expect, beforeEach, vi } from "vitest";

// "server-only" lança sempre que importado fora do bundler do Next.js (o
// gate por `typeof window` só existe no comportamento simulado pelo
// webpack) — precisa ser mockado para o arquivo carregar sob vitest/node.
vi.mock("server-only", () => ({}));

interface FakeApiKeyRow {
  id: string;
  userId: string;
  provider: string;
  tipo: string;
  chaveEncrypted: string;
  iv: string;
  authTag: string;
  maskedHint: string;
  statusValidacao: boolean;
  lastValidatedAt: Date | null;
  lastError: string | null;
}

let rows: FakeApiKeyRow[] = [];
let nextId = 1;

function matchesWhere(row: FakeApiKeyRow, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && "in" in (value as { in: unknown[] })) {
      return (value as { in: unknown[] }).in.includes((row as unknown as Record<string, unknown>)[key]);
    }
    return (row as unknown as Record<string, unknown>)[key] === value;
  });
}

vi.mock("@wordbee/db", () => ({
  prisma: {
    apiKey: {
      findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => rows.filter((r) => matchesWhere(r, where))),
      deleteMany: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
        const before = rows.length;
        rows = rows.filter((r) => !matchesWhere(r, where));
        return { count: before - rows.length };
      }),
    },
  },
}));

const { deleteApiKey, listApiKeyCards } = await import("./api-keys");

const USER_ID = "user-1";

/** Insere uma linha de chave "já salva" direto na tabela fake, sem passar por saveApiKey (que faria uma chamada de rede real ao provedor). */
function seedKey(provider: string, tipo: "TEXTO" | "IMAGEM" | "AMBOS"): FakeApiKeyRow {
  const row: FakeApiKeyRow = {
    id: `key-${nextId++}`,
    userId: USER_ID,
    provider,
    tipo,
    chaveEncrypted: "cipher",
    iv: "iv",
    authTag: "tag",
    maskedHint: "sk-***abcd",
    statusValidacao: true,
    lastValidatedAt: new Date(),
    lastError: null,
  };
  rows.push(row);
  return row;
}

describe("deleteApiKey", () => {
  beforeEach(() => {
    rows = [];
    nextId = 1;
  });

  it("remove com sucesso a chave de um provedor não compartilhado (ex.: Grok, tipo=TEXTO)", async () => {
    seedKey("GROK", "TEXTO");
    await deleteApiKey(USER_ID, "GROK", "TEXTO");
    expect(rows).toHaveLength(0);
  });

  it("é idempotente: remover uma chave que já não existe não lança erro", async () => {
    await expect(deleteApiKey(USER_ID, "GROK", "TEXTO")).resolves.toBeUndefined();
    expect(rows).toHaveLength(0);
  });

  it("não afeta a chave de outro usuário", async () => {
    seedKey("GROK", "TEXTO");
    rows[0]!.userId = "outro-usuario";
    await deleteApiKey(USER_ID, "GROK", "TEXTO");
    expect(rows).toHaveLength(1);
  });

  it("provedor de chave compartilhada (OPENAI/GEMINI/OPENROUTER): remover pela aba de texto também some da aba de imagem", async () => {
    seedKey("OPENROUTER", "AMBOS");

    let cards = await listApiKeyCards(USER_ID);
    expect(cards.texto.find((c) => c.provider === "OPENROUTER")?.configured).toBe(true);
    expect(cards.imagem.find((c) => c.provider === "OPENROUTER")?.configured).toBe(true);

    await deleteApiKey(USER_ID, "OPENROUTER", "TEXTO");

    cards = await listApiKeyCards(USER_ID);
    expect(cards.texto.find((c) => c.provider === "OPENROUTER")?.configured).toBe(false);
    expect(cards.imagem.find((c) => c.provider === "OPENROUTER")?.configured).toBe(false);
  });

  it("provedor de chave compartilhada: remover pela aba de imagem também some da aba de texto", async () => {
    seedKey("GEMINI", "AMBOS");

    await deleteApiKey(USER_ID, "GEMINI", "IMAGEM");

    const cards = await listApiKeyCards(USER_ID);
    expect(cards.texto.find((c) => c.provider === "GEMINI")?.configured).toBe(false);
    expect(cards.imagem.find((c) => c.provider === "GEMINI")?.configured).toBe(false);
  });

  it("não afeta chaves de outros provedores configuradas ao mesmo tempo", async () => {
    seedKey("OPENAI", "AMBOS");
    seedKey("GROK", "TEXTO");

    await deleteApiKey(USER_ID, "OPENAI", "TEXTO");

    const cards = await listApiKeyCards(USER_ID);
    expect(cards.texto.find((c) => c.provider === "OPENAI")?.configured).toBe(false);
    expect(cards.texto.find((c) => c.provider === "GROK")?.configured).toBe(true);
  });
});
