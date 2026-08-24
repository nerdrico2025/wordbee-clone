import "server-only";
import { prisma } from "@wordbee/db";
import { decrypt, encrypt, maskSecret } from "@wordbee/shared";
import type { WpSiteCredentials } from "@wordbee/shared";

export async function getSiteCredentials(userId: string, siteId: string): Promise<WpSiteCredentials & { id: string; nome: string }> {
  const site = await prisma.wpSite.findFirst({ where: { id: siteId, userId } });
  if (!site) throw new Error("Site não encontrado.");
  const appPassword = decrypt({ ciphertext: site.appPasswordEncrypted, iv: site.iv, authTag: site.authTag });
  return { id: site.id, nome: site.nome, url: site.url, usuario: site.usuario, appPassword };
}

export function encryptAppPassword(rawPassword: string) {
  const { ciphertext, iv, authTag } = encrypt(rawPassword);
  return { appPasswordEncrypted: ciphertext, iv, authTag, maskedHint: maskSecret(rawPassword.replace(/\s/g, ""), 0) };
}
