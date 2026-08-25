import { describe, it, expect } from "vitest";
import { classifyHttpError, AiProviderError } from "./errors.js";

describe("classifyHttpError", () => {
  it("401 e 403 viram invalid_key", () => {
    expect(classifyHttpError(401, "openai").code).toBe("invalid_key");
    expect(classifyHttpError(403, "gemini").code).toBe("invalid_key");
  });

  it("429 vira rate_limit", () => {
    expect(classifyHttpError(429, "grok").code).toBe("rate_limit");
  });

  it("402 vira insufficient_credits (usado pelo OpenRouter para saldo esgotado)", () => {
    const err = classifyHttpError(402, "openrouter");
    expect(err.code).toBe("insufficient_credits");
    expect(err.userMessage).toContain("Créditos insuficientes");
    expect(err.userMessage).toContain("openrouter.ai");
  });

  it("502/503/504 viram unavailable (sobrecarga temporária do provedor)", () => {
    expect(classifyHttpError(502, "gemini").code).toBe("unavailable");
    expect(classifyHttpError(503, "gemini").code).toBe("unavailable");
    expect(classifyHttpError(504, "gemini").code).toBe("unavailable");
  });

  it("400 com corpo mencionando política de conteúdo vira content_blocked", () => {
    expect(classifyHttpError(400, "openai", "content_filter triggered").code).toBe("content_blocked");
  });

  it("400 com corpo dizendo que a API key é inválida (padrão da Gemini) vira invalid_key", () => {
    const body = JSON.stringify({ error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } });
    expect(classifyHttpError(400, "gemini", body).code).toBe("invalid_key");
  });

  it("400 sem menção a política vira unknown", () => {
    expect(classifyHttpError(400, "openai", "missing field prompt").code).toBe("unknown");
  });

  it("outros status viram unknown", () => {
    expect(classifyHttpError(500, "stability").code).toBe("unknown");
  });

  it("mensagem do usuário é em português e nunca inclui o corpo bruto sem contexto", () => {
    const err = classifyHttpError(429, "gemini");
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err.userMessage).toContain("Gemini");
    expect(err.userMessage.toLowerCase()).toContain("limite");
  });
});
