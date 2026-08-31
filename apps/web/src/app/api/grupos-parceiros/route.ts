import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { createGrupoParceiroSchema } from "@/lib/validators";
import { GRUPO_INCLUDE, toGrupoSummary } from "@/lib/grupos-parceiros";
import { toDataPrevista } from "@/lib/distribution";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const grupos = await prisma.grupoParceiro.findMany({
    where: { userId: session.user.id },
    orderBy: { nome: "asc" },
    include: GRUPO_INCLUDE,
  });
  return NextResponse.json({ grupos: grupos.map(toGrupoSummary) });
}

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = createGrupoParceiroSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const grupo = await prisma.grupoParceiro.create({
    data: {
      userId: session.user.id,
      nome: parsed.data.nome.trim(),
      link: parsed.data.link.trim(),
      adminContato: parsed.data.adminContato?.trim() || null,
      valorPagoCentavos: parsed.data.valorPagoCentavos ?? 0,
      periodoInicio: toDataPrevista(parsed.data.periodoInicio),
      periodoFim: parsed.data.periodoFim ? toDataPrevista(parsed.data.periodoFim) : null,
      confirmaDivulgacaoParceria: parsed.data.confirmaDivulgacaoParceria ?? false,
      membrosAprox: parsed.data.membrosAprox ?? null,
      status: parsed.data.status ?? "ATIVO",
    },
    include: GRUPO_INCLUDE,
  });

  return NextResponse.json({ grupo: toGrupoSummary(grupo) });
}
