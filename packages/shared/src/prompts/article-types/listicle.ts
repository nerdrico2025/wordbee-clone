import type { ArticleTypeConfig } from "../common.js";

export const listicle: ArticleTypeConfig = {
  label: "listas (listicles)",
  estrutura: `- Introdução curta contextualizando por que essa lista é útil.
- Itens numerados como subtítulos H2 ou H3 (ex.: "1. ...", "2. ...").
- Uma explicação objetiva e útil para cada item da lista.
- Conclusão convidando o leitor a testar ou escolher um dos itens.`,
};
