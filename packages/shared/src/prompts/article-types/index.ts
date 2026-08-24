import type { ArticleTypeSlug } from "../../article-types.js";
import type { ArticleTypeConfig } from "../common.js";
import { receita } from "./receita.js";
import { tutorial } from "./tutorial.js";
import { passoAPasso } from "./passo-a-passo.js";
import { noticias } from "./noticias.js";
import { novidades } from "./novidades.js";
import { curiosidades } from "./curiosidades.js";
import { opiniao } from "./opiniao.js";
import { reviews } from "./reviews.js";
import { guiaCompleto } from "./guia-completo.js";
import { comparativo } from "./comparativo.js";
import { listicle } from "./listicle.js";
import { faq } from "./faq.js";
import { analise } from "./analise.js";
import { estudoDeCaso } from "./estudo-de-caso.js";

export const ARTICLE_TYPE_PROMPTS: Record<ArticleTypeSlug, ArticleTypeConfig> = {
  RECEITA: receita,
  TUTORIAL: tutorial,
  PASSO_A_PASSO: passoAPasso,
  NOTICIAS: noticias,
  NOVIDADES: novidades,
  CURIOSIDADES: curiosidades,
  OPINIAO: opiniao,
  REVIEWS: reviews,
  GUIA_COMPLETO: guiaCompleto,
  COMPARATIVO: comparativo,
  LISTICLE: listicle,
  FAQ: faq,
  ANALISE: analise,
  ESTUDO_DE_CASO: estudoDeCaso,
};
