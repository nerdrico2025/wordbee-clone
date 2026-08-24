export const COMMON_OUTPUT_INSTRUCTIONS = `Regras de saída (siga todas):
- Responda em português do Brasil, com linguagem natural e fluida.
- Gere HTML compatível com o editor Gutenberg do WordPress, usando apenas estas tags: <h2>, <h3>, <p>, <ul>, <li>, <ol>, <strong>, <em>, <blockquote>.
- Nunca use markdown (**, #, -, etc.) nem a tag <h1> (o título do post já é o H1).
- A introdução precisa prender a atenção do leitor nas duas primeiras frases.
- Otimize para SEO: use o tema e termos relacionados naturalmente ao longo do texto, sem repetição forçada.
- Feche o artigo com uma conclusão clara.
- Não escreva nada fora do HTML do artigo (sem comentários, sem "aqui está o artigo").`;

export interface ArticleTypeConfig {
  label: string;
  estrutura: string;
}

export function buildArticleSystemPrompt(config: {
  tipoLabel: string;
  estrutura: string;
  tema: string;
  titulo: string;
  promptCustomizado?: string;
}): string {
  const partes = [
    `Você é um redator especialista em ${config.tipoLabel} para blogs em português do Brasil.`,
    ``,
    `Tema/nicho: ${config.tema}`,
    `Título do artigo: ${config.titulo}`,
    ``,
    `Estrutura esperada para este tipo de artigo (${config.tipoLabel}):`,
    config.estrutura,
    ``,
    COMMON_OUTPUT_INSTRUCTIONS,
  ];
  if (config.promptCustomizado?.trim()) {
    partes.push(``, `Instruções adicionais do usuário (siga com prioridade sobre o resto):`, config.promptCustomizado.trim());
  }
  return partes.join("\n");
}

export function buildTitleSuggestionPrompt(config: {
  tipoLabel: string;
  tema: string;
  quantidade: number;
  titulosExistentes?: string[];
}): string {
  const partes = [
    `Sugira ${config.quantidade} títulos de artigo em português do Brasil, do tipo "${config.tipoLabel}", sobre o tema/nicho "${config.tema}".`,
    `Os títulos devem ser chamativos, otimizados para SEO (até 60 caracteres quando possível) e variados entre si (não repita a mesma ideia com palavras diferentes).`,
  ];
  if (config.titulosExistentes?.length) {
    partes.push(`Não repita nem parafraseie estes títulos já usados:\n${config.titulosExistentes.map((t) => `- ${t}`).join("\n")}`);
  }
  partes.push(`Responda APENAS com um JSON array de strings, sem markdown, sem explicação. Exemplo: ["Título 1", "Título 2"]`);
  return partes.join("\n\n");
}
