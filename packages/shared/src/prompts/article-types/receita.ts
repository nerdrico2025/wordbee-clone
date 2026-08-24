import type { ArticleTypeConfig } from "../common.js";

export const receita: ArticleTypeConfig = {
  label: "receitas culinárias",
  estrutura: `- Introdução breve contando a origem, o contexto ou o motivo de preparar essa receita.
- Lista de ingredientes com quantidades, usando <ul><li>.
- Modo de preparo em passos numerados, usando <ol><li>.
- Dicas de substituição de ingredientes ou variações da receita.
- Tempo de preparo e rendimento, quando fizer sentido.
- Conclusão convidando o leitor a experimentar e comentar o resultado.`,
};
