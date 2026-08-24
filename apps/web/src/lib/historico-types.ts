export interface HistoricoArticle {
  id: string;
  titulo: string;
  tipo: string;
  status: string;
  origem: "MANUAL" | "LINHA";
  lineNome: string | null;
  siteNome: string;
  wpUrl: string | null;
  erroMsg: string | null;
  createdAt: string;
}

export interface HistoricoFiltersValue {
  site?: string;
  status?: string;
  linha?: string;
  de?: string;
  ate?: string;
  busca?: string;
  page?: string;
}
