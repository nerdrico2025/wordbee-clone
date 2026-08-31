import { redirect } from "next/navigation";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { GRUPO_INCLUDE, toGrupoSummary } from "@/lib/grupos-parceiros";
import { GruposClient } from "@/components/distribuicao/GruposClient";

export default async function GruposParceirosPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const [grupos, perfis] = await Promise.all([
    prisma.grupoParceiro.findMany({
      where: { userId: session.user.id },
      orderBy: { nome: "asc" },
      include: GRUPO_INCLUDE,
    }),
    prisma.divulgacaoPerfil.findMany({
      where: { userId: session.user.id },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, ativo: true },
    }),
  ]);

  return <GruposClient initialGrupos={grupos.map(toGrupoSummary)} perfis={perfis} />;
}
