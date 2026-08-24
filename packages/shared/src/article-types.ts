/**
 * Espelha o enum ArticleType do Prisma (packages/db) como union de strings,
 * para uso em packages/shared sem criar dependência circular em @wordbee/db.
 * Os valores precisam ficar idênticos aos do schema.prisma.
 */
export const ARTICLE_TYPES = [
  "RECEITA",
  "TUTORIAL",
  "PASSO_A_PASSO",
  "NOTICIAS",
  "NOVIDADES",
  "CURIOSIDADES",
  "OPINIAO",
  "REVIEWS",
  "GUIA_COMPLETO",
  "COMPARATIVO",
  "LISTICLE",
  "FAQ",
  "ANALISE",
  "ESTUDO_DE_CASO",
] as const;

export type ArticleTypeSlug = (typeof ARTICLE_TYPES)[number];

export const ARTICLE_TYPE_LABELS: Record<ArticleTypeSlug, string> = {
  RECEITA: "Receita",
  TUTORIAL: "Tutorial",
  PASSO_A_PASSO: "Passo a Passo",
  NOTICIAS: "Notícias",
  NOVIDADES: "Novidades",
  CURIOSIDADES: "Curiosidades",
  OPINIAO: "Opinião",
  REVIEWS: "Reviews",
  GUIA_COMPLETO: "Guia Completo",
  COMPARATIVO: "Comparativo",
  LISTICLE: "Lista/Listicle",
  FAQ: "FAQ",
  ANALISE: "Análise",
  ESTUDO_DE_CASO: "Estudo de Caso",
};
