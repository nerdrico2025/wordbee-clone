export type AiErrorCode = "invalid_key" | "rate_limit" | "timeout" | "content_blocked" | "unavailable" | "unknown";

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  grok: "Grok (xAI)",
  stability: "Stability AI",
};

/** Erro normalizado de provedor de IA, com mensagem pronta para exibir em PT-BR. */
export class AiProviderError extends Error {
  readonly code: AiErrorCode;
  readonly provider: string;
  readonly userMessage: string;

  constructor(code: AiErrorCode, provider: string, detail?: string) {
    const userMessage = buildUserMessage(code, provider);
    super(detail ? `${userMessage} (${detail})` : userMessage);
    this.name = "AiProviderError";
    this.code = code;
    this.provider = provider;
    this.userMessage = userMessage;
  }
}

function buildUserMessage(code: AiErrorCode, provider: string): string {
  const label = PROVIDER_LABELS[provider] ?? provider;
  switch (code) {
    case "invalid_key":
      return `Chave de API do ${label} inválida ou sem permissão. Verifique a chave cadastrada em Chaves de API.`;
    case "rate_limit":
      return `Limite de uso do ${label} atingido. Tente novamente mais tarde ou use outro provedor.`;
    case "timeout":
      return `O ${label} demorou demais para responder. Tente novamente em instantes.`;
    case "content_blocked":
      return `O conteúdo foi bloqueado pelas políticas do ${label}. Ajuste o tema ou o prompt customizado.`;
    case "unavailable":
      return `O ${label} está temporariamente sobrecarregado. Tente novamente em instantes ou use outro provedor.`;
    default:
      return `Erro inesperado ao se comunicar com o ${label}. Tente novamente.`;
  }
}

/** Classifica um status HTTP + corpo de resposta em um AiErrorCode normalizado. */
export function classifyHttpError(status: number, provider: string, bodyText?: string): AiProviderError {
  if (status === 401 || status === 403) {
    return new AiProviderError("invalid_key", provider, bodyText?.slice(0, 200));
  }
  if (status === 429) {
    return new AiProviderError("rate_limit", provider, bodyText?.slice(0, 200));
  }
  if (status === 502 || status === 503 || status === 504) {
    return new AiProviderError("unavailable", provider, bodyText?.slice(0, 200));
  }
  // A Gemini (e outras APIs) retorna 400/INVALID_ARGUMENT para chave inválida
  // em vez de 401 — trata como invalid_key também nesse caso.
  if (status === 400 && bodyText && /api[ _-]?key.{0,40}(invalid|not valid)|invalid.{0,10}api[ _-]?key|api_key_invalid/i.test(bodyText)) {
    return new AiProviderError("invalid_key", provider, bodyText.slice(0, 200));
  }
  if (status === 400 && bodyText && /safety|blocked|policy|content_filter|moderation/i.test(bodyText)) {
    return new AiProviderError("content_blocked", provider, bodyText.slice(0, 200));
  }
  return new AiProviderError("unknown", provider, `HTTP ${status}: ${bodyText?.slice(0, 200) ?? ""}`);
}
