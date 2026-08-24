import { describe, it, expect } from "vitest";
import { slugify } from "./slugify.js";

describe("slugify", () => {
  it("remove acentos e converte para minúsculas", () => {
    expect(slugify("Como Fazer Pão de Queijo Fácil")).toBe("como-fazer-pao-de-queijo-facil");
  });

  it("remove pontuação e caracteres especiais", () => {
    expect(slugify("10 Dicas Incríveis! (Você não vai acreditar)")).toBe("10-dicas-incriveis-voce-nao-vai-acreditar");
  });

  it("colapsa espaços e hífens repetidos", () => {
    expect(slugify("um   texto -- com   espaços")).toBe("um-texto-com-espacos");
  });

  it("trunca em 80 caracteres sem deixar hífen sobrando no final", () => {
    const slug = slugify("a".repeat(100));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
  });
});
