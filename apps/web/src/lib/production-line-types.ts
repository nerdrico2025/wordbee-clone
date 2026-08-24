export interface ProductionLineSummary {
  id: string;
  nome: string;
  status: "ATIVA" | "PAUSADA" | "CONCLUIDA";
  wpSite: { nome: string };
  tipoArtigo: string;
  intervaloMin: number;
  temas: string[];
  maxArtigos: number | null;
  geradosCount: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  pauseReason: string | null;
}

export interface ReferenceImageSummary {
  id: string;
  storageUrl: string;
  ordem: number;
}

export interface TitleQueueItemSummary {
  id: string;
  titulo: string;
  previstoPara: string;
  status: string;
}

export interface LineArticleSummary {
  id: string;
  titulo: string;
  status: string;
  wpUrl: string | null;
  publishedAt: string | null;
}

export interface ProductionLineDetail extends ProductionLineSummary {
  wpSiteId: string;
  categoriaWpId: number | null;
  categoriaWpNome: string | null;
  iaTexto: string;
  iaImagem: string;
  statusWp: "PUBLISH" | "DRAFT";
  promptCustomizado: string | null;
  rateLimitBehavior: string;
  consecutiveFailures: number;
  referenceImages: ReferenceImageSummary[];
  titleQueue: TitleQueueItemSummary[];
  articles: LineArticleSummary[];
}
