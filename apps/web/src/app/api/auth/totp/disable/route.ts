import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@wordbee/db";
import { verifyPassword } from "@wordbee/shared";
import { getCurrentSession } from "@/lib/auth";

const schema = z.object({ password: z.string().min(1, "Informe a senha atual.") });

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !(await verifyPassword(user.senhaHash, parsed.data.password))) {
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }

  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null } });

  return NextResponse.json({ ok: true });
}
