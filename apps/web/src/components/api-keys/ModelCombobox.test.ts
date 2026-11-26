import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { OpenRouterModelInfo } from "@wordbee/shared";
import { comboboxReducer, filterModels, formatModelPrice, type ComboboxState } from "./model-combobox-logic";
import { ModelCombobox } from "./ModelCombobox";

function model(id: string, nome: string, extra: Partial<OpenRouterModelInfo> = {}): OpenRouterModelInfo {
  return { id, nome, contexto: null, precoEntradaPorToken: null, precoSaidaPorToken: null, precoPorImagem: null, ...extra };
}

const MODELS = [
  model("deepseek/deepseek-v4-flash-0731", "DeepSeek V4 Flash"),
  model("anthropic/claude-sonnet-5.5", "Anthropic: Claude Sonnet 5.5"),
  model("google/gemini-3.6-flash", "Google: Gemini 3.6 Flash"),
];
const IDS = MODELS.map((m) => m.id);

const CLOSED: ComboboxState = { value: "", open: false, highlighted: -1 };

describe("combobox de modelo — seleção da lista", () => {
  it("filtra por id ou nome, sem diferenciar maiúsculas", () => {
    expect(filterModels(MODELS, "CLAUDE").map((m) => m.id)).toEqual(["anthropic/claude-sonnet-5.5"]);
    expect(filterModels(MODELS, "flash").map((m) => m.id)).toEqual(["deepseek/deepseek-v4-flash-0731", "google/gemini-3.6-flash"]);
    expect(filterModels(MODELS, "google flash").map((m) => m.id)).toEqual(["google/gemini-3.6-flash"]);
  });

  it("clicar num item escolhe o id dele e fecha a lista", () => {
    const s = comboboxReducer({ value: "cla", open: true, highlighted: -1 }, { type: "select", id: "anthropic/claude-sonnet-5.5" }, IDS);
    expect(s).toEqual({ value: "anthropic/claude-sonnet-5.5", open: false, highlighted: -1 });
  });

  it("setas + Enter escolhem o item destacado", () => {
    let s = comboboxReducer(CLOSED, { type: "move", delta: 1 }, IDS);
    expect(s).toMatchObject({ open: true, highlighted: 0 });
    s = comboboxReducer(s, { type: "move", delta: 1 }, IDS);
    s = comboboxReducer(s, { type: "enter" }, IDS);
    expect(s).toEqual({ value: "anthropic/claude-sonnet-5.5", open: false, highlighted: -1 });
  });

  it("seta para cima a partir do primeiro volta para o último", () => {
    let s = comboboxReducer(CLOSED, { type: "move", delta: 1 }, IDS);
    s = comboboxReducer(s, { type: "move", delta: -1 }, IDS);
    expect(s.highlighted).toBe(IDS.length - 1);
  });

  it("depois de escolher, a lista volta a mostrar todos os modelos para permitir trocar", () => {
    expect(filterModels(MODELS, "anthropic/claude-sonnet-5.5")).toHaveLength(MODELS.length);
  });
});

describe("combobox de modelo — digitação manual", () => {
  it("o texto digitado vira o valor na hora, mesmo fora do catálogo", () => {
    const s = comboboxReducer(CLOSED, { type: "type", text: "meu/modelo-privado" }, []);
    expect(s).toEqual({ value: "meu/modelo-privado", open: true, highlighted: -1 });
  });

  it("Enter sem item destacado mantém o ID digitado (não troca por um item da lista)", () => {
    let s = comboboxReducer(CLOSED, { type: "type", text: "flash" }, IDS);
    s = comboboxReducer(s, { type: "enter" }, ["deepseek/deepseek-v4-flash-0731", "google/gemini-3.6-flash"]);
    expect(s).toEqual({ value: "flash", open: false, highlighted: -1 });
  });

  it("catálogo vazio (OpenRouter fora do ar): digitar continua funcionando", () => {
    let s = comboboxReducer(CLOSED, { type: "type", text: "x/y" }, []);
    s = comboboxReducer(s, { type: "move", delta: 1 }, []);
    s = comboboxReducer(s, { type: "enter" }, []);
    expect(s.value).toBe("x/y");
  });
});

describe("preço", () => {
  it("formata preço por 1 milhão de tokens", () => {
    const txt = formatModelPrice({ precoEntradaPorToken: 0.0000002, precoSaidaPorToken: 0.0000008, precoPorImagem: null });
    expect(txt).toMatch(/0,20.*entrada.*0,80.*saída.*1 milhão de tokens/);
  });
  it("sem preço no catálogo → null; tudo zero → Gratuito", () => {
    expect(formatModelPrice({ precoEntradaPorToken: null, precoSaidaPorToken: null, precoPorImagem: null })).toBeNull();
    expect(formatModelPrice({ precoEntradaPorToken: 0, precoSaidaPorToken: 0, precoPorImagem: null })).toBe("Gratuito");
  });
});

describe("<ModelCombobox /> — marcação acessível", () => {
  it("label associado ao campo e papel de combobox", () => {
    const html = renderToStaticMarkup(
      createElement(ModelCombobox, {
        id: "modelo-texto",
        label: "Modelo de texto",
        value: "",
        onChange: () => undefined,
        models: MODELS,
        placeholder: "Padrão: deepseek/deepseek-v4-flash-0731",
      })
    );
    expect(html).toContain('for="modelo-texto"');
    expect(html).toContain('id="modelo-texto"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('aria-expanded="false"');
  });
});
