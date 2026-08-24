import { prisma } from "@wordbee/db";
import type { AiProvider, ApiKeyKind } from "@wordbee/db";
import { decrypt } from "@wordbee/shared";
import type { AiProviderName } from "@wordbee/shared";

type Capability = "TEXTO" | "IMAGEM";

function tiposToQuery(capability: Capability): ApiKeyKind[] {
  return capability === "TEXTO" ? ["TEXTO", "AMBOS"] : ["IMAGEM", "AMBOS"];
}

/** Espelha apps/web/src/lib/api-keys.ts#getDecryptedApiKey — duplicado deliberadamente (ver DECISIONS.md). */
export async function getDecryptedApiKey(userId: string, provider: AiProviderName, capability: Capability): Promise<string | null> {
  const row = await prisma.apiKey.findFirst({
    where: { userId, provider: provider as AiProvider, tipo: { in: tiposToQuery(capability) }, statusValidacao: true },
  });
  if (!row) return null;
  return decrypt({ ciphertext: row.chaveEncrypted, iv: row.iv, authTag: row.authTag });
}
