import { NextResponse } from "next/server";
import { prisma } from "@wordbee/db";
import { getCurrentSession, clearSessionCookie } from "@/lib/auth";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const target = await prisma.session.findUnique({ where: { id: params.id } });
  if (!target || target.userId !== session.user.id) {
    return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });
  }

  await prisma.session.update({ where: { id: target.id }, data: { revokedAt: new Date() } });

  if (target.id === session.sessionId) {
    clearSessionCookie();
  }

  return NextResponse.json({ ok: true });
}
