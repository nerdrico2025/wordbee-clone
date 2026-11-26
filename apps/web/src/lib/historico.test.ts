import { describe, it, expect } from "vitest";
import { toHistoricoModelos } from "./historico";

describe("Histórico — modelo usado por artigo", () => {
  it("artigos antigos sem modelo gravado mostram —", () => {
    expect(toHistoricoModelos({ modeloTexto: null, modeloImagem: null })).toEqual({
      modeloTexto: null,
      modeloImagem: null,
      modeloTextoNome: "—",
      modeloImagemNome: "—",
    });
  });

  it("mostra o nome amigável do modelo gravado (ou o ID, se desconhecido)", () => {
    expect(toHistoricoModelos({ modeloTexto: "deepseek/deepseek-v4-flash-0731", modeloImagem: "x/novo" })).toMatchObject({
      modeloTextoNome: "DeepSeek V4 Flash",
      modeloImagemNome: "x/novo",
    });
  });

  it("usa o nome salvo no painel para o modelo escolhido lá", () => {
    const nomes = { "anthropic/claude-sonnet-5.5": "Anthropic: Claude Sonnet 5.5" };
    expect(toHistoricoModelos({ modeloTexto: "anthropic/claude-sonnet-5.5", modeloImagem: null }, nomes).modeloTextoNome).toBe(
      "Anthropic: Claude Sonnet 5.5"
    );
  });
});
