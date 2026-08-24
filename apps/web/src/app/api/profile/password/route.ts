import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@wordbee/db";
import { verifyPassword, hashPassword } from "@wordbee/shared";
import { getCurrentSession, revokeAllOtherSessions } from "@/lib/auth";
import { changePasswordSchema } from "@/lib/validators";

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !(await verifyPassword(user.senhaHash, parsed.data.currentPassword))) {
    return NextResponse.json({ error: "Senha atual incorreta." }, { status: 401 });
  }

  const senhaHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { senhaHash } });

  // Por segurança, trocar a senha encerra as demais sessões ativas.
  await revokeAllOtherSessions(user.id, session.sessionId);

  return NextResponse.json({ ok: true });
}
