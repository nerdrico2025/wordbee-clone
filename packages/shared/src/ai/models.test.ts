import { describe, it, expect } from "vitest";
import { resolveModelId, resolveModel, CODE_DEFAULT_MODELS } from "./models.js";

const PAINEL = {
  textProvider: "OPENROUTER" as const,
  textModel: "anthropic/claude-sonnet-5.5",
  imageProvider: "OPENROUTER" as const,
  imageModel: "openai/gpt-image-1",
};

const ENV = {
  OPENROUTER_DEFAULT_MODEL: "env/texto",
  OPENROUTER_IMAGE_DEFAULT_MODEL: "env/imagem",
};

describe("resolveModelId — prioridade painel > env > padrão do código", () => {
  it("usa o modelo do painel quando configurado", () => {
    expect(resolveModelId("text", "OPENROUTER", PAINEL, ENV)).toBe("anthropic/claude-sonnet-5.5");
    expect(resolveModelId("image", "OPENROUTER", PAINEL, ENV)).toBe("openai/gpt-image-1");
  });

  it("sem painel, usa a env", () => {
    expect(resolveModelId("text", "OPENROUTER", null, ENV)).toBe("env/texto");
    expect(resolveModelId("image", "OPENROUTER", undefined, ENV)).toBe("env/imagem");
  });

  it("sem painel e sem env, usa o padrão do código", () => {
    expect(resolveModelId("text", "OPENROUTER", null, {})).toBe(CODE_DEFAULT_MODELS.OPENROUTER.text);
    expect(resolveModelId("image", "OPENROUTER", null, {})).toBe(CODE_DEFAULT_MODELS.OPENROUTER.image);
  });

  it("modelo do painel nulo ou vazio cai para a env", () => {
    expect(resolveModelId("text", "OPENROUTER", { ...PAINEL, textModel: null }, ENV)).toBe("env/texto");
    expect(resolveModelId("text", "OPENROUTER", { ...PAINEL, textModel: "" }, ENV)).toBe("env/texto");
    expect(resolveModelId("image", "OPENROUTER", { ...PAINEL, imageModel: "   " }, ENV)).toBe("env/imagem");
  });

  it("env vazia cai para o padrão do código", () => {
    expect(resolveModelId("text", "OPENROUTER", null, { OPENROUTER_DEFAULT_MODEL: "" })).toBe(CODE_DEFAULT_MODELS.OPENROUTER.text);
    expect(resolveModelId("image", "OPENROUTER", null, { OPENROUTER_IMAGE_DEFAULT_MODEL: "  " })).toBe(
      CODE_DEFAULT_MODELS.OPENROUTER.image
    );
  });

  it("modelo do painel só vale para o provedor ao qual foi salvo (um ID do OpenRouter nunca vai para o Gemini)", () => {
    expect(resolveModelId("text", "GEMINI", PAINEL, { GEMINI_TEXT_MODEL: "gemini-env" })).toBe("gemini-env");
    expect(resolveModelId("image", "GEMINI", PAINEL, {})).toBe(CODE_DEFAULT_MODELS.GEMINI.image);
  });

  it("painel sem provedor registrado é ignorado (não adivinha a qual provedor o ID pertence)", () => {
    expect(resolveModelId("text", "OPENROUTER", { textProvider: null, textModel: "x/y" }, ENV)).toBe("env/texto");
  });

  it("outros provedores mantêm o comportamento atual (env → padrão)", () => {
    expect(resolveModelId("text", "OPENAI", null, {})).toBe("gpt-4o");
    expect(resolveModelId("text", "OPENAI", null, { OPENAI_TEXT_MODEL: "gpt-x" })).toBe("gpt-x");
    expect(resolveModelId("image", "STABILITY", null, {})).toBe("sd3.5-large");
  });

  it("resolveModel informa a origem do valor (para a tela mostrar o que está em uso)", () => {
    expect(resolveModel("text", "OPENROUTER", PAINEL, ENV)).toEqual({ modelId: "anthropic/claude-sonnet-5.5", origem: "painel" });
    expect(resolveModel("text", "OPENROUTER", null, ENV)).toEqual({ modelId: "env/texto", origem: "env" });
    expect(resolveModel("text", "OPENROUTER", null, {})).toEqual({ modelId: CODE_DEFAULT_MODELS.OPENROUTER.text, origem: "padrao" });
  });

  it("Stability não tem modelo de texto", () => {
    expect(() => resolveModelId("text", "STABILITY", null, {})).toThrow();
  });
});
