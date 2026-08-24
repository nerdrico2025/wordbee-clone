import { NextResponse } from "next/server";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { getSiteCredentials } from "@/lib/wp-sites";
import { testConnection, WordPressError } from "@wordbee/shared";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    const creds = await getSiteCredentials(session.user.id, params.id);
    const result = await testConnection(creds);
    await prisma.wpSite.update({
      where: { id: params.id },
      data: { lastTestAt: new Date(), lastTestOk: true, lastTestError: null },
    });
    return NextResponse.json({ ok: true, roles: result.roles });
  } catch (err) {
    const message = err instanceof WordPressError ? err.userMessage : "Erro inesperado ao testar a conexão.";
    await prisma.wpSite.update({
      where: { id: params.id },
      data: { lastTestAt: new Date(), lastTestOk: false, lastTestError: message },
    }).catch(() => undefined);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
