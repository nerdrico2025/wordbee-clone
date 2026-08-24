import { WordPressError } from "./errors.js";

const BLOCKED_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

/**
 * Checagem básica anti-SSRF por hostname/IP literal (bloqueia localhost e
 * faixas privadas óbvias). Não resolve DNS — a blindagem completa contra
 * DNS rebinding é tratada na varredura de segurança do PROMPT 4.
 */
export function assertPublicHttpsUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new WordPressError("invalid_url", "URL malformada");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new WordPressError("invalid_url", "protocolo não suportado");
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new WordPressError("invalid_url", "host não permitido");
  }
  if (isPrivateIpLiteral(hostname)) {
    throw new WordPressError("invalid_url", "endereço de rede privada não permitido");
  }

  return url;
}

function isPrivateIpLiteral(hostname: string): boolean {
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  if (hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80")) {
    return true;
  }
  return false;
}
