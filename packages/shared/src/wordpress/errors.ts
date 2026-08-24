export type WordPressErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "not_admin"
  | "network"
  | "timeout"
  | "invalid_url"
  | "unknown";

export class WordPressError extends Error {
  readonly code: WordPressErrorCode;
  readonly userMessage: string;

  constructor(code: WordPressErrorCode, detail?: string) {
    const userMessage = buildUserMessage(code);
    super(detail ? `${userMessage} (${detail})` : userMessage);
    this.name = "WordPressError";
    this.code = code;
    this.userMessage = userMessage;
  }
}

function buildUserMessage(code: WordPressErrorCode): string {
  switch (code) {
    case "unauthorized":
      return "Usuário ou senha de aplicação inválidos.";
    case "forbidden":
      return "Acesso negado pelo site (pode ser um bloqueio de firewall/WAF). Verifique as permissões do usuário.";
    case "not_found":
      return "A REST API do WordPress não foi encontrada nesse endereço. Verifique a URL e se a REST API está habilitada.";
    case "not_admin":
      return "O usuário informado não tem permissão de administrador nesse site.";
    case "network":
      return "Não foi possível conectar ao site. Verifique se a URL está correta e se o site está no ar.";
    case "timeout":
      return "O site demorou demais para responder. Tente novamente.";
    case "invalid_url":
      return "URL do site inválida ou apontando para um endereço não permitido.";
    default:
      return "Erro inesperado ao comunicar com o WordPress.";
  }
}

export function classifyWpHttpStatus(status: number): WordPressErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  return "unknown";
}
