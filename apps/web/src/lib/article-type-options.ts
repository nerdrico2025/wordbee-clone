/**
 * Cópia client-safe dos 14 tipos de artigo (RF-25). Mantida separada de
 * @wordbee/shared para não puxar módulos Node-only (crypto, fetch de IA)
 * para o bundle do cliente através do barrel de exports do pacote.
 */
export const ARTICLE_TYPE_OPTIONS = [
  { value: "RECEITA", label: "Receita" },
  { value: "TUTORIAL", label: "Tutorial" },
  { value: "PASSO_A_PASSO", label: "Passo a Passo" },
  { value: "NOTICIAS", label: "Notícias" },
  { value: "NOVIDADES", label: "Novidades" },
  { value: "CURIOSIDADES", label: "Curiosidades" },
  { value: "OPINIAO", label: "Opinião" },
  { value: "REVIEWS", label: "Reviews" },
  { value: "GUIA_COMPLETO", label: "Guia Completo" },
  { value: "COMPARATIVO", label: "Comparativo" },
  { value: "LISTICLE", label: "Lista/Listicle" },
  { value: "FAQ", label: "FAQ" },
  { value: "ANALISE", label: "Análise" },
  { value: "ESTUDO_DE_CASO", label: "Estudo de Caso" },
] as const;

export type ArticleTypeValue = (typeof ARTICLE_TYPE_OPTIONS)[number]["value"];
