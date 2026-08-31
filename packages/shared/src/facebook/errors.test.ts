import { describe, it, expect } from "vitest";
import { FacebookError, redactTokens, classifyGraphError } from "./errors.js";

const TOKEN = "EAAGm0PX4ZCpsBA1ZCZBqZAZBoZDZD8xKvQwErTyUiOpAsDfGhJkLzXcVbNm";

describe("redactTokens", () => {
  it("apaga token passado como parâmetro de query", () => {
    const texto = redactTokens(`fetch failed: https://graph.facebook.com/v21.0/123/feed?access_token=${TOKEN}&x=1`);
    expect(texto).not.toContain(TOKEN);
    expect(texto).toContain("access_token=[REDIGIDO]");
    // O resto da URL continua legível — a mensagem ainda precisa servir para depurar.
    expect(texto).toContain("graph.facebook.com");
    expect(texto).toContain("&x=1");
  });

  it("apaga token passado no header Authorization", () => {
    const texto = redactTokens(`request headers: Authorization: Bearer ${TOKEN}`);
    expect(texto).not.toContain(TOKEN);
    expect(texto).toContain("Bearer [REDIGIDO]");
  });

  it("apaga token solto, sem prefixo nenhum", () => {
    expect(redactTokens(`token usado: ${TOKEN}`)).not.toContain(TOKEN);
  });

  it("não estraga um texto sem token", () => {
    const texto = "Error validating access token: Session has expired on Monday.";
    expect(redactTokens(texto)).toBe(texto);
  });
});

describe("FacebookError", () => {
  it("redige o token antes de compor a mensagem — ela vira last_error no banco e linha de log", () => {
    const err = new FacebookError("network", `connect ECONNREFUSED https://graph.facebook.com/v21.0/1?access_token=${TOKEN}`);

    expect(err.message).not.toContain(TOKEN);
    expect(err.message).toContain("[REDIGIDO]");
  });

  it("a mensagem para o usuário nunca carrega detalhe técnico nenhum", () => {
    const err = new FacebookError("invalid_token", `algo com ${TOKEN}`);

    expect(err.userMessage).toBe("Token da Página inválido ou expirado. Gere um novo token de Página e salve novamente.");
    expect(err.userMessage).not.toContain(TOKEN);
  });

  it("erro classificado a partir da resposta da Graph API também sai redigido", () => {
    const err = classifyGraphError(400, JSON.stringify({ error: { message: `bad token ${TOKEN}`, code: 190 } }));

    expect(err.code).toBe("invalid_token");
    expect(err.message).not.toContain(TOKEN);
  });
});
