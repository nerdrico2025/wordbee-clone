import type { ArticleTypeConfig } from "../common.js";

export const tutorial: ArticleTypeConfig = {
  label: "tutoriais práticos",
  estrutura: `- Introdução apresentando o problema que o leitor quer resolver.
- Lista do que é necessário (materiais, ferramentas ou conhecimento prévio).
- Passo a passo numerado, com instruções claras e diretas em cada etapa.
- Seção com erros comuns a evitar.
- Conclusão com os próximos passos ou dicas para ir além.`,
};
