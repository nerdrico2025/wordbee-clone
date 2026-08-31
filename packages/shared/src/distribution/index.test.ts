import { describe, it, expect } from "vitest";
import { generateShortCode, buildSearchUrl, buildTrackedUrl, trocarLinkDaCopy, buildAlbumImagePrompt } from "./index.js";

describe("generateShortCode", () => {
  it("gera o comprimento pedido", () => {
    expect(generateShortCode()).toHaveLength(8);
    expect(generateShortCode(12)).toHaveLength(12);
  });

  it("nunca usa caracteres ambíguos (0/O/1/l/I) — o código é ditado e digitado à mão", () => {
    const amostra = Array.from({ length: 200 }, () => generateShortCode(12)).join("");
    expect(amostra).not.toMatch(/[0O1lI]/);
  });

  it("não repete na prática", () => {
    const codigos = new Set(Array.from({ length: 500 }, () => generateShortCode()));
    expect(codigos.size).toBe(500);
  });
});

describe("buildSearchUrl", () => {
  it("monta a busca nativa do WordPress", () => {
    expect(buildSearchUrl("https://blog.test", "doce de leite")).toBe("https://blog.test/?s=doce%20de%20leite");
  });

  it("não duplica a barra final do site", () => {
    expect(buildSearchUrl("https://blog.test/", "bolo")).toBe("https://blog.test/?s=bolo");
    expect(buildSearchUrl("https://blog.test///", "bolo")).toBe("https://blog.test/?s=bolo");
  });

  it("escapa acentos e caracteres especiais do tema", () => {
    expect(buildSearchUrl("https://blog.test", "pão & café")).toBe("https://blog.test/?s=p%C3%A3o%20%26%20caf%C3%A9");
  });
});

describe("buildTrackedUrl", () => {
  it("monta a URL pública do link curto sem barra dupla", () => {
    expect(buildTrackedUrl("https://app.test", "aB3dE5f7")).toBe("https://app.test/r/aB3dE5f7");
    expect(buildTrackedUrl("https://app.test/", "aB3dE5f7")).toBe("https://app.test/r/aB3dE5f7");
  });
});

describe("trocarLinkDaCopy", () => {
  const copy = "Tá aqui, ó:\n\nhttps://blog.test/bolo";

  it("troca o link de destino pelo link rastreado da combinação", () => {
    expect(trocarLinkDaCopy(copy, "https://blog.test/bolo", "https://app.test/r/aB3dE5f7")).toBe(
      "Tá aqui, ó:\n\nhttps://app.test/r/aB3dE5f7"
    );
  });

  it("anexa o link quando o pacote ainda não tinha destino", () => {
    expect(trocarLinkDaCopy("Tá aqui, ó:", null, "https://app.test/r/x")).toBe("Tá aqui, ó:\n\nhttps://app.test/r/x");
  });

  it("anexa (em vez de perder o link) se o destino esperado não estiver no texto", () => {
    expect(trocarLinkDaCopy("Texto sem link", "https://blog.test/bolo", "https://app.test/r/x")).toBe(
      "Texto sem link\n\nhttps://app.test/r/x"
    );
  });

  it("troca todas as ocorrências, não só a primeira", () => {
    const duplicado = "Veja https://blog.test/bolo — repito: https://blog.test/bolo";
    expect(trocarLinkDaCopy(duplicado, "https://blog.test/bolo", "https://app.test/r/x")).toBe(
      "Veja https://app.test/r/x — repito: https://app.test/r/x"
    );
  });
});

describe("buildAlbumImagePrompt", () => {
  it("varia o enquadramento entre as imagens do álbum (senão saem praticamente iguais)", () => {
    const prompts = [0, 1, 2, 3].map((i) => buildAlbumImagePrompt("Bolo de cenoura", "receitas", i));
    expect(new Set(prompts).size).toBe(4);
  });

  it("pede explicitamente imagem sem texto/marca sobreposta", () => {
    expect(buildAlbumImagePrompt("Bolo", "receitas", 0)).toMatch(/sem nenhum texto, letra, marca d'água ou logotipo/);
  });
});
