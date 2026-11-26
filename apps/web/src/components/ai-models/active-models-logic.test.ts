import { describe, it, expect } from "vitest";
import { withActiveModels, AI_MODELS_UPDATED_CHANNEL } from "./active-models-logic";

const modelo = (label: string) => ({ modelId: "id", nome: label, label, origem: "padrao" as const });

describe("withActiveModels — opções do select seguem os modelos ativos", () => {
  it("troca o modelo da opção pelo valor revalidado", () => {
    const opcoes = [{ provider: "OPENROUTER" as const, nome: "OpenRouter", modelo: modelo("OpenRouter (Velho)") }];
    const atualizado = withActiveModels(opcoes, { OPENROUTER: modelo("OpenRouter (Novo)") });
    expect(atualizado[0]!.modelo.label).toBe("OpenRouter (Novo)");
  });

  it("mantém a opção como veio se o provedor não estiver na resposta", () => {
    const opcoes = [{ provider: "GROK" as const, nome: "Grok", modelo: modelo("Grok (Grok 2)") }];
    expect(withActiveModels(opcoes, {})[0]!.modelo.label).toBe("Grok (Grok 2)");
  });

  it("canal de aviso entre abas tem nome estável", () => {
    expect(AI_MODELS_UPDATED_CHANNEL).toBe("wordbee:ai-models-updated");
  });
});
