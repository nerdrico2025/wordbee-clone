import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
vi.mock("@wordbee/db", () => ({ prisma: { aiModelSettings: { findUnique } } }));

const { getAiModelSettings, clearAiModelSettingsCache, AI_MODEL_SETTINGS_CACHE_MS } = await import("./ai-model-settings.js");

const ROW = { textProvider: "OPENROUTER", textModel: "a/b", imageProvider: "OPENROUTER", imageModel: "c/d" };

beforeEach(() => {
  vi.clearAllMocks();
  clearAiModelSettingsCache();
});

describe("getAiModelSettings (worker)", () => {
  it("cache de no máximo 60s", () => {
    expect(AI_MODEL_SETTINGS_CACHE_MS).toBeLessThanOrEqual(60_000);
  });

  it("dentro da janela de cache não relê o banco", async () => {
    findUnique.mockResolvedValue(ROW);
    await getAiModelSettings("u1", 1_000);
    await getAiModelSettings("u1", 1_000 + AI_MODEL_SETTINGS_CACHE_MS - 1);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it("depois da janela, relê o banco e pega o valor novo (sem restart)", async () => {
    findUnique.mockResolvedValueOnce(ROW).mockResolvedValueOnce({ ...ROW, textModel: "novo/modelo" });
    const primeiro = await getAiModelSettings("u1", 0);
    const segundo = await getAiModelSettings("u1", AI_MODEL_SETTINGS_CACHE_MS + 1);
    expect(primeiro?.textModel).toBe("a/b");
    expect(segundo?.textModel).toBe("novo/modelo");
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("sem linha no banco devolve null (= usar env/padrão)", async () => {
    findUnique.mockResolvedValue(null);
    expect(await getAiModelSettings("u1", 0)).toBeNull();
  });

  it("erro no banco nunca derruba a linha: usa o último valor conhecido, ou null", async () => {
    findUnique.mockResolvedValueOnce(ROW).mockRejectedValueOnce(new Error("db fora")).mockRejectedValueOnce(new Error("db fora"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await getAiModelSettings("u1", 0);
    expect((await getAiModelSettings("u1", AI_MODEL_SETTINGS_CACHE_MS + 1))?.textModel).toBe("a/b");
    expect(await getAiModelSettings("outro", 0)).toBeNull();
  });
});
