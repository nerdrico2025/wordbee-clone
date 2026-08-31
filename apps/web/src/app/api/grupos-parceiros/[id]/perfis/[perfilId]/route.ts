import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { GRUPO_INCLUDE, toGrupoSummary } from "@/lib/grupos-parceiros";

/** Remove o vínculo de um perfil com um grupo (a pessoa saiu do grupo). */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; perfilId: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const grupo = await prisma.grupoParceiro.findFirst({ where: { id: params.id, userId: session.user.id } });
  if (!grupo) return NextResponse.json({ error: "Grupo não encontrado." }, { status: 404 });

  await prisma.perfilGrupo.deleteMany({
    where: { grupoParceiroId: params.id, divulgacaoPerfilId: params.perfilId },
  });

  const atualizado = await prisma.grupoParceiro.findUniqueOrThrow({ where: { id: params.id }, include: GRUPO_INCLUDE });
  return NextResponse.json({ grupo: toGrupoSummary(atualizado) });
}
