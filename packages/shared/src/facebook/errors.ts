export type FacebookErrorCode =
  | "invalid_token"
  | "permission"
  | "rate_limit"
  | "invalid_request"
  | "not_found"
  | "unavailable"
  | "network"
  | "timeout"
  | "unknown";

/**
 * Remove qualquer token que tenha vazado para dentro de um texto de erro.
 *
 * Rede de segurança, não a defesa principal: o código deste projeto manda o
 * token sempre no header ou no corpo do formulário, nunca na URL. Mas a
 * mensagem de erro de uma biblioteca HTTP pode embutir a URL chamada, e o
 * `message` de um `FacebookError` é persistido (`facebook_pages.last_error`,
 * `page_distribution_posts.erro_msg`) e impresso no log do worker — dois
 * lugares onde um token em texto puro seria exatamente o que o PRD (RF-14)
 * proíbe. Barato o suficiente para valer como cinto e suspensório.
 */
export function redactTokens(text: string): string {
  return text
    .replace(/(access_token=)[^&\s"']+/gi, "$1[REDIGIDO]")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[REDIGIDO]")
    // Tokens de Página da Meta começam com "EAA" e são longos; pega o caso
    // de o token aparecer solto, sem prefixo de parâmetro nem de header.
    .replace(/\bEAA[A-Za-z0-9]{20,}/g, "[REDIGIDO]");
}

export class FacebookError extends Error {
  readonly code: FacebookErrorCode;
  readonly userMessage: string;
  /** Código numérico bruto devolvido pela Graph API, quando houver (para log/depuração). */
  readonly fbCode?: number;

  constructor(code: FacebookErrorCode, detail?: string, fbCode?: number) {
    const userMessage = buildUserMessage(code);
    const detalheSeguro = detail ? redactTokens(detail) : undefined;
    super(detalheSeguro ? `${userMessage} (${detalheSeguro})` : userMessage);
    this.name = "FacebookError";
    this.code = code;
    this.userMessage = userMessage;
    this.fbCode = fbCode;
  }
}

function buildUserMessage(code: FacebookErrorCode): string {
  switch (code) {
    case "invalid_token":
      return "Token da Página inválido ou expirado. Gere um novo token de Página e salve novamente.";
    case "permission":
      return "O token não tem permissão para esta ação. Confirme que ele é um token de Página com as permissões de publicação e que você é administrador da Página.";
    case "rate_limit":
      return "Limite de requisições do Facebook atingido. A publicação será tentada de novo mais tarde.";
    case "invalid_request":
      return "O Facebook recusou os dados enviados. Verifique o ID da Página e o conteúdo do post.";
    case "not_found":
      return "Página ou publicação não encontrada no Facebook. Verifique o ID da Página.";
    case "unavailable":
      return "O Facebook está temporariamente indisponível. Tente novamente em alguns minutos.";
    case "network":
      return "Não foi possível conectar ao Facebook. Verifique a conexão e tente de novo.";
    case "timeout":
      return "O Facebook demorou demais para responder. Tente novamente.";
    default:
      return "Erro inesperado ao comunicar com o Facebook.";
  }
}

/**
 * Erros da Graph API vêm num envelope próprio
 * (`{"error":{"message","type","code","error_subcode"}}`) — o `code`
 * numérico de dentro do corpo é mais confiável que o status HTTP, que é
 * quase sempre 400 mesmo para causas completamente diferentes (token
 * expirado, permissão faltando, rate limit). Por isso a classificação olha
 * primeiro o corpo e só cai no status HTTP quando não há envelope
 * reconhecível. Lista de códigos: developers.facebook.com/docs/graph-api/guides/error-handling
 */
export function classifyGraphError(status: number, bodyText: string): FacebookError {
  const parsed = parseGraphErrorBody(bodyText);
  const detail = parsed?.message ?? bodyText.slice(0, 200);

  if (parsed?.code !== undefined) {
    const code = classifyGraphErrorCode(parsed.code);
    if (code) return new FacebookError(code, detail, parsed.code);
  }

  if (status === 401 || status === 403) return new FacebookError("permission", detail, parsed?.code);
  if (status === 404) return new FacebookError("not_found", detail, parsed?.code);
  if (status === 429) return new FacebookError("rate_limit", detail, parsed?.code);
  if (status >= 500) return new FacebookError("unavailable", detail, parsed?.code);
  if (status === 400) return new FacebookError("invalid_request", detail, parsed?.code);
  return new FacebookError("unknown", detail, parsed?.code);
}

function classifyGraphErrorCode(fbCode: number): FacebookErrorCode | null {
  // 190: token inválido/expirado/revogado (todos os subcódigos).
  if (fbCode === 190) return "invalid_token";
  // 3/10/200-299: faixa de "permissão/capacidade ausente" da Graph API.
  if (fbCode === 3 || fbCode === 10 || (fbCode >= 200 && fbCode <= 299)) return "permission";
  // 4/17/32/341/613: throttling por app, por usuário, por página ou por edge.
  if (fbCode === 4 || fbCode === 17 || fbCode === 32 || fbCode === 341 || fbCode === 613) return "rate_limit";
  // 1/2: erro temporário/serviço indisponível do lado da Meta.
  if (fbCode === 1 || fbCode === 2) return "unavailable";
  if (fbCode === 803) return "not_found";
  if (fbCode === 100) return "invalid_request";
  return null;
}

interface ParsedGraphError {
  message?: string;
  code?: number;
}

function parseGraphErrorBody(bodyText: string): ParsedGraphError | null {
  try {
    const json = JSON.parse(bodyText) as { error?: { message?: unknown; code?: unknown } };
    const error = json.error;
    if (!error || typeof error !== "object") return null;
    return {
      message: typeof error.message === "string" ? error.message : undefined,
      code: typeof error.code === "number" ? error.code : undefined,
    };
  } catch {
    return null;
  }
}
