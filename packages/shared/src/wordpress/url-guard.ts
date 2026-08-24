import { lookup } from "node:dns/promises";
import { WordPressError } from "./errors.js";

const BLOCKED_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

/**
 * Checagem síncrona anti-SSRF por hostname/IP literal (bloqueia localhost e
 * faixas privadas óbvias digitadas diretamente na URL). Não resolve DNS —
 * use `assertSafeWordPressUrl` (async) para a blindagem completa contra
 * domínios que resolvem para IPs privados (DNS rebinding).
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
  if (isPrivateIp(hostname)) {
    throw new WordPressError("invalid_url", "endereço de rede privada não permitido");
  }

  return url;
}

/**
 * Blindagem completa: além da checagem síncrona acima, resolve o hostname
 * via DNS e bloqueia se QUALQUER endereço resolvido (IPv4 ou IPv6) cair em
 * faixa privada/loopback/link-local — impede que um domínio público seja
 * apontado (ou re-apontado depois, DNS rebinding) para a rede interna.
 *
 * Não elimina 100% o TOCTOU entre a checagem e a conexão real (exigiria
 * fixar o IP resolvido no socket), mas cobre o caso prático relevante para
 * um app pessoal: cadastro de um site WordPress com URL maliciosa.
 */
export async function assertSafeWordPressUrl(rawUrl: string): Promise<URL> {
  const url = assertPublicHttpsUrl(rawUrl);

  let addresses: { address: string }[];
  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new WordPressError("network", "não foi possível resolver o endereço do site");
  }

  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new WordPressError("invalid_url", "o endereço do site resolve para uma rede privada não permitida");
  }

  return url;
}

function isPrivateIp(hostname: string): boolean {
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  const h = hostname.toLowerCase();
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") || h.startsWith("::ffff:127.")) return true;
  return false;
}
