import { describe, it, expect } from "vitest";
import { resolveModelDisplay, friendlyModelName, formatArticleModel, KNOWN_MODEL_NAMES } from "./model-display.js";
import { CODE_DEFAULT_MODELS, resolveModelId } from "./models.js";
import { TEXT_PROVIDERS, IMAGE_PROVIDERS } from "./registry.js";

describe("resolveModelDisplay — rótulo da tela vem da configuração resolvida", () => {
  it("sem painel e sem env: padrão do código com nome amigável", () => {
    const d = resolveModelDisplay("text", "OPENROUTER", null, {});
    expect(d.modelId).toBe(CODE_DEFAULT_MODELS.OPENROUTER.text);
    expect(d.origem).toBe("padrao");
    expect(d.label).toBe("OpenRouter (DeepSeek V4 Flash)");
  });

  it("o rótulo muda quando a configuração do painel muda", () => {
    const antes = resolveModelDisplay("text", "OPENROUTER", null, {});
    const depois = resolveModelDisplay(
      "text",
      "OPENROUTER",
      { textProvider: "OPENROUTER", textModel: "anthropic/claude-sonnet-5.5", textModelName: "Anthropic: Claude Sonnet 5.5" },
      {}
    );
    expect(depois.label).not.toBe(antes.label);
    expect(depois.label).toBe("OpenRouter (Anthropic: Claude Sonnet 5.5)");
    expect(depois.origem).toBe("painel");
  });

  it("modelo do painel sem nome amigável mostra o ID", () => {
    const d = resolveModelDisplay("image", "OPENROUTER", { imageProvider: "OPENROUTER", imageModel: "openai/gpt-image-9" }, {});
    expect(d.nome).toBe("openai/gpt-image-9");
    expect(d.label).toBe("OpenRouter (openai/gpt-image-9)");
  });

  it("campo nulo no painel cai para a env", () => {
    const d = resolveModelDisplay(
      "text",
      "OPENROUTER",
      { textProvider: null, textModel: null, textModelName: null },
      { OPENROUTER_DEFAULT_MODEL: "meta/llama-9" }
    );
    expect(d.modelId).toBe("meta/llama-9");
    expect(d.origem).toBe("env");
    expect(d.label).toBe("OpenRouter (meta/llama-9)");
  });

  it("nome salvo no painel não vaza para um modelo vindo da env", () => {
    // Provedor do painel é outro → o nome gravado não vale para o OpenRouter.
    const d = resolveModelDisplay(
      "text",
      "OPENROUTER",
      { textProvider: "GEMINI", textModel: "x", textModelName: "Nome Errado" },
      {}
    );
    expect(d.label).toBe("OpenRouter (DeepSeek V4 Flash)");
  });

  it("usa o mesmo modelId que a geração (resolveModelId)", () => {
    const settings = { textProvider: "OPENROUTER" as const, textModel: "a/b", imageProvider: null, imageModel: null };
    const env = { OPENROUTER_IMAGE_DEFAULT_MODEL: "c/d" };
    expect(resolveModelDisplay("text", "OPENROUTER", settings, env).modelId).toBe(resolveModelId("text", "OPENROUTER", settings, env));
    expect(resolveModelDisplay("image", "OPENROUTER", settings, env).modelId).toBe(resolveModelId("image", "OPENROUTER", settings, env));
  });

  it("outros provedores também usam o modelo resolvido (env → padrão)", () => {
    expect(resolveModelDisplay("text", "GEMINI", null, {}).label).toBe("Gemini (Gemini 3.6 Flash)");
    expect(resolveModelDisplay("text", "OPENAI", null, { OPENAI_TEXT_MODEL: "gpt-9" }).label).toBe("OpenAI (gpt-9)");
  });

  it("todo padrão do código tem nome amigável conhecido", () => {
    for (const p of TEXT_PROVIDERS) expect(KNOWN_MODEL_NAMES[CODE_DEFAULT_MODELS[p.provider].text!]).toBeTruthy();
    for (const p of IMAGE_PROVIDERS) expect(KNOWN_MODEL_NAMES[CODE_DEFAULT_MODELS[p.provider].image]).toBeTruthy();
  });

  it("o registry não tem mais rótulo de modelo fixo", () => {
    for (const p of [...TEXT_PROVIDERS, ...IMAGE_PROVIDERS]) expect(p).not.toHaveProperty("modeloLabel");
  });
});

describe("friendlyModelName / formatArticleModel", () => {
  it("nome conhecido, nome extra, ou o próprio ID", () => {
    expect(friendlyModelName("google/gemini-2.5-flash-image")).toBe("Nano Banana (Gemini 2.5 Flash Image)");
    expect(friendlyModelName("x/y", { "x/y": "Modelo XY" })).toBe("Modelo XY");
    expect(friendlyModelName("x/y")).toBe("x/y");
  });

  it("artigo antigo sem modelo gravado mostra —", () => {
    expect(formatArticleModel(null)).toBe("—");
    expect(formatArticleModel(undefined)).toBe("—");
    expect(formatArticleModel("")).toBe("—");
    expect(formatArticleModel("deepseek/deepseek-v4-flash-0731")).toBe("DeepSeek V4 Flash");
  });
});
