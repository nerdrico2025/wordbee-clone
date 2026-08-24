import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@wordbee/db";
import { verifyTotpToken } from "@wordbee/shared";
import { getCurrentSession } from "@/lib/auth";
import { totpVerifySchema } from "@/lib/validators";

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = totpVerifySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user?.totpSecret) {
    return NextResponse.json({ error: "Inicie a configuração do 2FA antes de verificar." }, { status: 400 });
  }

  if (!verifyTotpToken(user.totpSecret, parsed.data.code)) {
    return NextResponse.json({ error: "Código de verificação inválido." }, { status: 401 });
  }

  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });

  return NextResponse.json({ ok: true });
}
