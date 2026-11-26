import type { OpenRouterModelInfo } from "@wordbee/shared";

/** Quantos itens a lista mostra de uma vez (o catálogo de texto passa de 300). */
export const MAX_VISIBLE_OPTIONS = 50;

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Filtra o catálogo pelo texto digitado (id ou nome, sem diferenciar
 * maiúsculas/acentos). Se o texto já é exatamente o id de um modelo (ex.:
 * logo depois de escolher um), mostra a lista toda para permitir trocar.
 */
export function filterModels(models: OpenRouterModelInfo[], query: string, limit = MAX_VISIBLE_OPTIONS): OpenRouterModelInfo[] {
  const q = normalize(query.trim());
  if (!q || models.some((m) => m.id === query.trim())) return models.slice(0, limit);
  const terms = q.split(/\s+/);
  return models.filter((m) => {
    const hay = normalize(`${m.id} ${m.nome}`);
    return terms.every((t) => hay.includes(t));
  }).slice(0, limit);
}

export interface ComboboxState {
  /** Texto do campo — é o próprio model id que será salvo (digitado ou escolhido). */
  value: string;
  open: boolean;
  /** Índice destacado na lista visível; -1 = nenhum. */
  highlighted: number;
}

export type ComboboxAction =
  | { type: "type"; text: string }
  | { type: "open" }
  | { type: "close" }
  | { type: "move"; delta: 1 | -1 }
  | { type: "select"; id: string }
  | { type: "enter" };

/**
 * Regras do combobox, sem React (testável sob vitest em ambiente node).
 * `visibleIds` são os ids da lista filtrada no momento da ação.
 *
 * - Digitar muda o valor na hora: o que estiver no campo é um ID manual
 *   válido, mesmo que não esteja no catálogo.
 * - Enter com um item destacado escolhe o item; sem destaque, só fecha a
 *   lista e mantém o ID digitado.
 */
export function comboboxReducer(state: ComboboxState, action: ComboboxAction, visibleIds: string[]): ComboboxState {
  switch (action.type) {
    case "type":
      return { value: action.text, open: true, highlighted: -1 };
    case "open":
      return { ...state, open: true };
    case "close":
      return { ...state, open: false, highlighted: -1 };
    case "move": {
      if (visibleIds.length === 0) return { ...state, open: true, highlighted: -1 };
      if (!state.open) return { ...state, open: true, highlighted: action.delta === 1 ? 0 : visibleIds.length - 1 };
      const next = (state.highlighted + action.delta + visibleIds.length) % visibleIds.length;
      return { ...state, open: true, highlighted: state.highlighted === -1 && action.delta === -1 ? visibleIds.length - 1 : next };
    }
    case "select":
      return { value: action.id, open: false, highlighted: -1 };
    case "enter": {
      const id = state.open && state.highlighted >= 0 ? visibleIds[state.highlighted] : undefined;
      return id ? { value: id, open: false, highlighted: -1 } : { ...state, open: false, highlighted: -1 };
    }
  }
}

const usd = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 4 });

/** Preço legível: "US$ 0,20 entrada · US$ 0,80 saída por 1 milhão de tokens". `null` se o catálogo não informou. */
export function formatModelPrice(model: Pick<OpenRouterModelInfo, "precoEntradaPorToken" | "precoSaidaPorToken" | "precoPorImagem">): string | null {
  const partes: string[] = [];
  const entrada = model.precoEntradaPorToken;
  const saida = model.precoSaidaPorToken;
  if (entrada !== null || saida !== null) {
    if (entrada === 0 && saida === 0) partes.push("Gratuito");
    else {
      const tokens: string[] = [];
      if (entrada !== null) tokens.push(`${usd.format(entrada * 1_000_000)} entrada`);
      if (saida !== null) tokens.push(`${usd.format(saida * 1_000_000)} saída`);
      partes.push(`${tokens.join(" · ")} por 1 milhão de tokens`);
    }
  }
  if (model.precoPorImagem !== null) partes.push(`${usd.format(model.precoPorImagem)} por imagem de entrada`);
  return partes.length > 0 ? partes.join(" · ") : null;
}

export function formatContext(contexto: number | null): string | null {
  if (!contexto) return null;
  return contexto >= 1000 ? `${Math.round(contexto / 1000)} mil tokens de contexto` : `${contexto} tokens de contexto`;
}
