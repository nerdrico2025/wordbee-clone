import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { updateProfileSchema } from "@/lib/validators";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return NextResponse.json({ user: session.user });
}

export async function PATCH(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = updateProfileSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: parsed.data,
  });

  return NextResponse.json({
    user: { id: user.id, nome: user.nome, email: user.email, temaUi: user.temaUi, totpEnabled: user.totpEnabled },
  });
}
