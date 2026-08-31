import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: () => new Map<string, string>() }));
vi.mock("@wordbee/db", () => ({ prisma: {} }));

const { calcularProjecao } = await import("./distribution-metrics.js");

describe("calcularProjecao", () => {
  it("aplica a fórmula pacotes/dia × perfis × grupos por perfil", () => {
    const p = calcularProjecao({ pacotesPorDia: 2, perfisAtivos: 5, gruposPorPerfil: 3, realizadasPorDia: 12 });

    expect(p.possiveisPorDia).toBe(30);
    expect(p.realizadasPorDia).toBe(12);
    expect(p.aproveitamento).toBeCloseTo(0.4);
  });

  it("sem perfis ativos, o potencial é zero e o aproveitamento fica indefinido (não NaN nem Infinity)", () => {
    const p = calcularProjecao({ pacotesPorDia: 3, perfisAtivos: 0, gruposPorPerfil: 0, realizadasPorDia: 0 });

    expect(p.possiveisPorDia).toBe(0);
    expect(p.aproveitamento).toBeNull();
  });

  it("realizado acima do potencial não quebra a conta (dá mais de 100%)", () => {
    // Acontece de verdade: itens enfileirados numa semana e postados na
    // seguinte, depois de um perfil ser desativado.
    const p = calcularProjecao({ pacotesPorDia: 1, perfisAtivos: 1, gruposPorPerfil: 1, realizadasPorDia: 3 });

    expect(p.possiveisPorDia).toBe(1);
    expect(p.aproveitamento).toBe(3);
  });

  it("arredonda as médias para uma casa — 0.42857 pacotes/dia não ajuda ninguém a decidir nada", () => {
    const p = calcularProjecao({ pacotesPorDia: 3 / 7, perfisAtivos: 2, gruposPorPerfil: 5 / 2, realizadasPorDia: 1 / 7 });

    expect(p.pacotesPorDia).toBe(0.4);
    expect(p.gruposPorPerfil).toBe(2.5);
    expect(p.realizadasPorDia).toBe(0.1);
  });

  it("o total possível é inteiro — meia distribuição não existe", () => {
    const p = calcularProjecao({ pacotesPorDia: 1.5, perfisAtivos: 3, gruposPorPerfil: 2.5, realizadasPorDia: 0 });

    expect(Number.isInteger(p.possiveisPorDia)).toBe(true);
    expect(p.possiveisPorDia).toBe(11); // 1.5 × 3 × 2.5 = 11.25
  });
});
