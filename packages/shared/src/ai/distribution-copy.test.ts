import { describe, it, expect } from "vitest";
import { parseDistributionCopyResponse } from "./distribution-copy.js";
import { AiProviderError } from "./errors.js";

const VALIDA = {
  copyDescricao: "Fiz esse bolo hoje e sumiu em minutos. Comenta QUERO que eu te mando...",
  copyComentario: "Tá aqui, ó — é só entrar e pegar a receita completa:",
  palavraChave: "quero",
};

const OUTRA = {
  copyDescricao: "Ninguém acredita que leva só 3 ingredientes. Comenta ENVIA...",
  copyComentario: "Prontinho, é só clicar e conferir o passo a passo:",
  palavraChave: "ENVIA",
};

describe("parseDistributionCopyResponse", () => {
  it("aceita o array de variações e normaliza a palavra-chave para caixa alta", () => {
    const copies = parseDistributionCopyResponse(JSON.stringify([VALIDA, OUTRA]), "openrouter");

    expect(copies).toHaveLength(2);
    expect(copies[0]!.copyDescricao).toBe(VALIDA.copyDescricao);
    expect(copies[0]!.palavraChave).toBe("QUERO");
    expect(copies[1]!.palavraChave).toBe("ENVIA");
  });

  it("aceita um objeto solto (modelo que ignorou o pedido de array) como uma variação", () => {
    const copies = parseDistributionCopyResponse(JSON.stringify(VALIDA), "openrouter");

    expect(copies).toHaveLength(1);
    expect(copies[0]!.copyComentario).toBe(VALIDA.copyComentario);
  });

  it("tolera a resposta vindo dentro de cerca de código markdown", () => {
    const copies = parseDistributionCopyResponse("```json\n" + JSON.stringify([VALIDA]) + "\n```", "openrouter");
    expect(copies[0]!.copyDescricao).toBe(VALIDA.copyDescricao);
  });

  it("usa QUERO como padrão quando o modelo esquece a palavra-chave", () => {
    const copies = parseDistributionCopyResponse(JSON.stringify([{ ...VALIDA, palavraChave: undefined }]), "openrouter");
    expect(copies[0]!.palavraChave).toBe("QUERO");
  });

  it("descarta a variação que veio com link e mantém as boas", () => {
    const comLink = { ...VALIDA, copyComentario: "Pega aqui: https://site-inventado.com/receita" };

    const copies = parseDistributionCopyResponse(JSON.stringify([comLink, OUTRA]), "openrouter");

    expect(copies).toHaveLength(1);
    expect(copies[0]!.copyDescricao).toBe(OUTRA.copyDescricao);
  });

  it("falha quando NENHUMA variação sobra — o link é anexado pelo código, nunca escrito pelo modelo", () => {
    const comLink = { ...VALIDA, copyComentario: "Pega aqui: https://site-inventado.com/receita" };
    const comWww = { ...OUTRA, copyDescricao: "Receita completa em www.site-inventado.com ..." };

    const err = (() => {
      try {
        parseDistributionCopyResponse(JSON.stringify([comLink, comWww]), "openrouter");
      } catch (e) {
        return e;
      }
    })();

    expect(err).toBeInstanceOf(AiProviderError);
    expect((err as AiProviderError).message).toMatch(/nenhuma variação/i);
  });

  it("descarta variação sem descrição ou sem comentário", () => {
    const copies = parseDistributionCopyResponse(
      JSON.stringify([{ ...VALIDA, copyDescricao: "   " }, { ...OUTRA, copyComentario: null }, VALIDA]),
      "openrouter"
    );
    expect(copies).toHaveLength(1);
  });

  it("rejeita resposta que não é JSON", () => {
    expect(() => parseDistributionCopyResponse("desculpa, não consegui gerar", "openrouter")).toThrow(AiProviderError);
  });
});
