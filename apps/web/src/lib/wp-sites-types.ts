export interface WpSiteSummary {
  id: string;
  nome: string;
  url: string;
  usuario: string;
  lastTestAt?: string | null;
  lastTestOk?: boolean | null;
  lastTestError?: string | null;
}
