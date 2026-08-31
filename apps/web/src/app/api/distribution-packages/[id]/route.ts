import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { updateDistributionPackageSchema } from "@/lib/validators";
import { aplicarVariacaoDeCopy } from "@/lib/distribution";

/** Troca a variação de copy ativa do pacote (sem gastar nova chamada de IA). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = updateDistributionPackageSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  try {
    await aplicarVariacaoDeCopy(session.user.id, params.id, parsed.data.variacaoIndice);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const existing = await prisma.distributionPackage.findFirst({ where: { id: params.id, userId: session.user.id } });
  if (!existing) return NextResponse.json({ error: "Pacote não encontrado." }, { status: 404 });

  // Cascade leva os itens da fila e os links rastreados deste pacote (e,
  // com eles, a contagem de cliques). Os posts já publicados no Facebook
  // continuam lá — o que se perde é o registro interno.
  await prisma.distributionPackage.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
