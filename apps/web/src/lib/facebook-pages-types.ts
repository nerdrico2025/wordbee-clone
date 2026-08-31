/**
 * Tipos client-safe das Páginas do Facebook — duplicados fora de
 * `@wordbee/shared` de propósito, mesmo motivo já registrado em
 * DECISIONS.md (o barrel do pacote reexporta módulos que usam
 * `node:crypto`/`undici`, que não devem vazar para o bundle do browser).
 *
 * Note que o token NUNCA aparece aqui: o único campo derivado dele que
 * chega ao cliente é `maskedHint`.
 */
export interface FacebookPageSummary {
  id: string;
  nome: string;
  pageId: string;
  maskedHint: string;
  statusValidacao: boolean;
  lastValidatedAt?: string | null;
  lastError?: string | null;
  wpSiteId?: string | null;
  wpSiteNome?: string | null;
}

export interface WpSiteOption {
  id: string;
  nome: string;
}
