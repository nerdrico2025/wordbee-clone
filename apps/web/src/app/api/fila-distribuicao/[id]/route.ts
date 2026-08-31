import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { updateFilaItemSchema } from "@/lib/validators";

/**
 * Registra o que a pessoa fez com um item da fila: postou, pulou, ou voltou
 * para pendente. É o único "efeito" que o app tem sobre o trilho assistido
 * — ele anota, não executa.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const existing = await prisma.filaDistribuicaoManual.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "Item da fila não encontrado." }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = updateFilaItemSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const item = await prisma.filaDistribuicaoManual.update({
    where: { id: params.id },
    data: {
      status: parsed.data.status,
      // `postadoEm` só existe quando o status é POSTADO — voltar para
      // PENDENTE limpa a marca, senão o histórico de cadência real ficaria
      // mentindo sobre quando a postagem aconteceu.
      postadoEm: parsed.data.status === "POSTADO" ? (existing.postadoEm ?? new Date()) : null,
      ...(parsed.data.observacao !== undefined ? { observacao: parsed.data.observacao?.trim() || null } : {}),
    },
    select: { id: true, status: true, postadoEm: true, observacao: true },
  });

  return NextResponse.json({
    item: {
      id: item.id,
      status: item.status,
      postadoEm: item.postadoEm?.toISOString() ?? null,
      observacao: item.observacao,
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const existing = await prisma.filaDistribuicaoManual.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "Item da fila não encontrado." }, { status: 404 });

  await prisma.filaDistribuicaoManual.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
