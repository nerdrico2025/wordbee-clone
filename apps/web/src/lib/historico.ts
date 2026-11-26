import { formatArticleModel } from "@wordbee/shared";

export interface HistoricoModelos {
  /** ID gravado no artigo (nulo nos artigos de antes do modelo configurável). */
  modeloTexto: string | null;
  modeloImagem: string | null;
  /** Nome amigável para a tela; "—" quando o artigo não tem o campo. */
  modeloTextoNome: string;
  modeloImagemNome: string;
}

/**
 * Modelo usado por artigo, como o Histórico mostra. Usa o que foi gravado em
 * `articles.modelo_texto/modelo_imagem` no momento da geração — não o modelo
 * ativo hoje. `nomes` = nomes amigáveis salvos no painel (ID → nome).
 */
export function toHistoricoModelos(
  article: { modeloTexto: string | null; modeloImagem: string | null },
  nomes?: Record<string, string>
): HistoricoModelos {
  return {
    modeloTexto: article.modeloTexto,
    modeloImagem: article.modeloImagem,
    modeloTextoNome: formatArticleModel(article.modeloTexto, nomes),
    modeloImagemNome: formatArticleModel(article.modeloImagem, nomes),
  };
}
