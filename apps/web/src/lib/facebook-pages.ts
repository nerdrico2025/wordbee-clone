import "server-only";
import { Prisma, prisma } from "@wordbee/db";
import { decrypt, encrypt, maskSecret } from "@wordbee/shared";
import type { FacebookPageCredentials } from "@wordbee/shared";
import type { FacebookPageSummary } from "@/lib/facebook-pages-types";

/**
 * Colunas devolvidas por toda leitura de Página que chega ao frontend.
 * Repare que `accessTokenEncrypted`/`iv`/`authTag` ficam de fora — o único
 * campo derivado do token que sai daqui é `maskedHint`.
 */
export const FACEBOOK_PAGE_SELECT = {
  id: true,
  nome: true,
  pageId: true,
  maskedHint: true,
  statusValidacao: true,
  lastValidatedAt: true,
  lastError: true,
  wpSiteId: true,
  wpSite: { select: { nome: true } },
} as const;

export type FacebookPageRow = Prisma.FacebookPageGetPayload<{ select: typeof FACEBOOK_PAGE_SELECT }>;

export function toFacebookPageSummary(page: FacebookPageRow): FacebookPageSummary {
  return {
    id: page.id,
    nome: page.nome,
    pageId: page.pageId,
    maskedHint: page.maskedHint,
    statusValidacao: page.statusValidacao,
    lastValidatedAt: page.lastValidatedAt?.toISOString() ?? null,
    lastError: page.lastError,
    wpSiteId: page.wpSiteId,
    wpSiteNome: page.wpSite?.nome ?? null,
  };
}

/**
 * Token de Página do Facebook: mesmo padrão de segredo em repouso já usado
 * por `api_keys` (chaves de IA) e `wp_sites` (senha de aplicação) —
 * AES-256-GCM com IV por chamada e `authTag` verificado no decrypt, mais um
 * `maskedHint` que é a ÚNICA forma do token aparecer em resposta de API ou
 * tela. O token em claro só existe em memória, no momento da chamada à
 * Graph API.
 */
export function encryptPageToken(rawToken: string) {
  const { ciphertext, iv, authTag } = encrypt(rawToken);
  return { accessTokenEncrypted: ciphertext, iv, authTag, maskedHint: maskSecret(rawToken) };
}

export async function getPageCredentials(
  userId: string,
  id: string
): Promise<FacebookPageCredentials & { id: string; nome: string }> {
  const page = await prisma.facebookPage.findFirst({ where: { id, userId } });
  if (!page) throw new Error("Página do Facebook não encontrada.");
  const accessToken = decrypt({ ciphertext: page.accessTokenEncrypted, iv: page.iv, authTag: page.authTag });
  return { id: page.id, nome: page.nome, pageId: page.pageId, accessToken };
}
