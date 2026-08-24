import type { ArticleTypeConfig } from "../common.js";

export const faq: ArticleTypeConfig = {
  label: "perguntas frequentes (FAQ)",
  estrutura: `- Introdução breve contextualizando o tema das perguntas.
- Cada pergunta como um subtítulo H3, seguida de uma resposta curta e direta em parágrafo.
- Ordene as perguntas da mais básica para a mais específica.
- Conclusão convidando o leitor a deixar outras dúvidas nos comentários.`,
};
