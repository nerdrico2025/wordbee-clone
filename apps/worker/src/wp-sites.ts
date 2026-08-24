import { prisma } from "@wordbee/db";
import { decrypt } from "@wordbee/shared";
import type { WpSiteCredentials } from "@wordbee/shared";

/** Espelha apps/web/src/lib/wp-sites.ts#getSiteCredentials — duplicado deliberadamente (ver DECISIONS.md). */
export async function getSiteCredentials(siteId: string): Promise<WpSiteCredentials> {
  const site = await prisma.wpSite.findUniqueOrThrow({ where: { id: siteId } });
  const appPassword = decrypt({ ciphertext: site.appPasswordEncrypted, iv: site.iv, authTag: site.authTag });
  return { url: site.url, usuario: site.usuario, appPassword };
}
