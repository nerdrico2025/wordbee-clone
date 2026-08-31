import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { updateGrupoParceiroSchema } from "@/lib/validators";
import { GRUPO_INCLUDE, toGrupoSummary } from "@/lib/grupos-parceiros";
import { toDataPrevista } from "@/lib/distribution";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const existing = await prisma.grupoParceiro.findFirst({ where: { id: params.id, userId: session.user.id } });
  if (!existing) return NextResponse.json({ error: "Grupo não encontrado." }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = updateGrupoParceiroSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  const d = parsed.data;

  const grupo = await prisma.grupoParceiro.update({
    where: { id: params.id },
    data: {
      ...(d.nome !== undefined ? { nome: d.nome.trim() } : {}),
      ...(d.link !== undefined ? { link: d.link.trim() } : {}),
      ...(d.adminContato !== undefined ? { adminContato: d.adminContato?.trim() || null } : {}),
      ...(d.valorPagoCentavos !== undefined ? { valorPagoCentavos: d.valorPagoCentavos } : {}),
      ...(d.periodoInicio !== undefined ? { periodoInicio: toDataPrevista(d.periodoInicio) } : {}),
      ...(d.periodoFim !== undefined ? { periodoFim: d.periodoFim ? toDataPrevista(d.periodoFim) : null } : {}),
      ...(d.confirmaDivulgacaoParceria !== undefined
        ? { confirmaDivulgacaoParceria: d.confirmaDivulgacaoParceria }
        : {}),
      ...(d.membrosAprox !== undefined ? { membrosAprox: d.membrosAprox ?? null } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
    },
    include: GRUPO_INCLUDE,
  });

  return NextResponse.json({ grupo: toGrupoSummary(grupo) });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const existing = await prisma.grupoParceiro.findFirst({ where: { id: params.id, userId: session.user.id } });
  if (!existing) return NextResponse.json({ error: "Grupo não encontrado." }, { status: 404 });

  // Cascade leva junto os vínculos com perfis e o histórico da fila daquele
  // grupo. Encerrar a parceria (status ENCERRADO) preserva o histórico —
  // é o que a UI sugere; o diálogo de exclusão avisa o que se perde.
  await prisma.grupoParceiro.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
