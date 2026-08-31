import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { updateDivulgacaoPerfilSchema } from "@/lib/validators";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const existing = await prisma.divulgacaoPerfil.findFirst({ where: { id: params.id, userId: session.user.id } });
  if (!existing) return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = updateDivulgacaoPerfilSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const perfil = await prisma.divulgacaoPerfil.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.nome !== undefined ? { nome: parsed.data.nome.trim() } : {}),
      ...(parsed.data.observacoes !== undefined ? { observacoes: parsed.data.observacoes?.trim() || null } : {}),
      ...(parsed.data.ativo !== undefined ? { ativo: parsed.data.ativo } : {}),
    },
    include: { _count: { select: { grupos: true } } },
  });

  return NextResponse.json({
    perfil: {
      id: perfil.id,
      nome: perfil.nome,
      observacoes: perfil.observacoes,
      ativo: perfil.ativo,
      gruposCount: perfil._count.grupos,
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const existing = await prisma.divulgacaoPerfil.findFirst({ where: { id: params.id, userId: session.user.id } });
  if (!existing) return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });

  // Excluir apaga junto o histórico de tarefas da pessoa (cascade). Quando
  // ela só parou de ajudar, desativar preserva o histórico — por isso a UI
  // sugere desativar e o diálogo avisa o que a exclusão leva junto.
  const postados = await prisma.filaDistribuicaoManual.count({
    where: { divulgacaoPerfilId: params.id, status: "POSTADO" },
  });

  await prisma.divulgacaoPerfil.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true, historicoRemovido: postados });
}
