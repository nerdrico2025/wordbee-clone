import { prisma } from "@wordbee/db";
import { decrypt } from "@wordbee/shared";
import type { FacebookPageCredentials } from "@wordbee/shared";

/**
 * Espelha apps/web/src/lib/facebook-pages.ts#getPageCredentials — duplicado
 * deliberadamente, mesmo motivo já registrado para `api-keys.ts`/`wp-sites.ts`
 * do worker (DECISIONS.md): o módulo do web é `server-only` e carrega o
 * runtime do Next; o worker é um processo Node puro e não deve importá-lo.
 */
export async function getPageCredentials(id: string): Promise<FacebookPageCredentials & { id: string; nome: string }> {
  const page = await prisma.facebookPage.findUnique({ where: { id } });
  if (!page) throw new Error("Página do Facebook não encontrada.");
  const accessToken = decrypt({ ciphertext: page.accessTokenEncrypted, iv: page.iv, authTag: page.authTag });
  return { id: page.id, nome: page.nome, pageId: page.pageId, accessToken };
}

/**
 * Páginas elegíveis para receber um artigo: as validadas do dono, vinculadas
 * ao blog do artigo OU sem vínculo nenhum ("todos os sites").
 *
 * `statusValidacao` é o portão: uma Página cujo token expirou é marcada como
 * inválida pelo pipeline de publicação e para de receber agendamentos até o
 * usuário testar/atualizar o token na tela — evita empilhar publicações
 * fadadas a falhar.
 */
export async function findEligiblePages(userId: string, wpSiteId: string) {
  return prisma.facebookPage.findMany({
    where: {
      userId,
      statusValidacao: true,
      OR: [{ wpSiteId: null }, { wpSiteId }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, nome: true },
  });
}
