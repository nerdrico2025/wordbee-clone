import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { createDivulgacaoPerfilSchema } from "@/lib/validators";
import type { DivulgacaoPerfilSummary } from "@/lib/distribution-types";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const perfis = await prisma.divulgacaoPerfil.findMany({
    where: { userId: session.user.id },
    orderBy: { nome: "asc" },
    include: { _count: { select: { grupos: true } } },
  });

  const resposta: DivulgacaoPerfilSummary[] = perfis.map((p) => ({
    id: p.id,
    nome: p.nome,
    observacoes: p.observacoes,
    ativo: p.ativo,
    gruposCount: p._count.grupos,
  }));
  return NextResponse.json({ perfis: resposta });
}

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = createDivulgacaoPerfilSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const perfil = await prisma.divulgacaoPerfil.create({
    data: {
      userId: session.user.id,
      nome: parsed.data.nome.trim(),
      observacoes: parsed.data.observacoes?.trim() || null,
      ativo: parsed.data.ativo ?? true,
    },
  });

  return NextResponse.json({
    perfil: { id: perfil.id, nome: perfil.nome, observacoes: perfil.observacoes, ativo: perfil.ativo, gruposCount: 0 },
  });
}
