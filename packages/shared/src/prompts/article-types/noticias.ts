import type { ArticleTypeConfig } from "../common.js";

export const noticias: ArticleTypeConfig = {
  label: "notícias",
  estrutura: `- Lead (primeiro parágrafo) respondendo o quê, quando, onde e por que aconteceu.
- Contexto e background do assunto logo em seguida.
- Detalhes relevantes organizados em subtítulos.
- Possíveis desdobramentos ou repercussões.
- Tom neutro e informativo, sem opinião pessoal do autor.`,
};
