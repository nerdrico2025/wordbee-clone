import type { AiProviderName, ModelDisplay } from "@wordbee/shared";

/** Formato de GET /api/settings/ai-models/active (espelha `ActiveModels` do servidor). */
export interface ActiveModelsPayload {
  texto: Partial<Record<AiProviderName, ModelDisplay>>;
  imagem: Partial<Record<AiProviderName, ModelDisplay>>;
}

/** Canal usado para avisar as outras abas que o modelo foi trocado em Modelos de IA. */
export const AI_MODELS_UPDATED_CHANNEL = "wordbee:ai-models-updated";

export const TROCAR_MODELO_HREF = "/chaves-de-api#modelos-de-ia";
export const NOTA_MODELO = "O modelo vale para todas as linhas e é lido a cada execução.";

/** Atualiza o modelo de cada opção de provedor com o valor revalidado. */
export function withActiveModels<T extends { provider: AiProviderName; modelo: ModelDisplay }>(
  opcoes: T[],
  ativos: Partial<Record<AiProviderName, ModelDisplay>>
): T[] {
  return opcoes.map((o) => {
    const modelo = ativos[o.provider];
    return modelo ? { ...o, modelo } : o;
  });
}
