import { NextResponse } from "next/server";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { getPageCredentials } from "@/lib/facebook-pages";
import { validatePageToken, FacebookError } from "@wordbee/shared";

/**
 * "Testar conexão" da tela de Páginas — mesmo papel do teste de conexão dos
 * Sites WordPress: uma chamada real e barata que confirma se a credencial
 * ainda funciona, gravando o resultado para o card mostrar depois.
 *
 * Útil de verdade aqui porque token de Página expira (tokens de curta
 * duração duram ~1h; os de longa duração, ~60 dias) — o worker também marca
 * `statusValidacao=false` quando uma publicação falha por token inválido, e
 * este botão é como o usuário confirma que resolveu.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    const creds = await getPageCredentials(session.user.id, params.id);
    const info = await validatePageToken(creds);
    await prisma.facebookPage.update({
      where: { id: params.id },
      data: { statusValidacao: true, lastValidatedAt: new Date(), lastError: null },
    });
    return NextResponse.json({ ok: true, nome: info.nome });
  } catch (err) {
    const message = err instanceof FacebookError ? err.userMessage : "Erro inesperado ao testar a conexão com o Facebook.";
    await prisma.facebookPage
      .updateMany({
        where: { id: params.id, userId: session.user.id },
        data: { statusValidacao: false, lastValidatedAt: new Date(), lastError: message },
      })
      .catch(() => undefined);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
