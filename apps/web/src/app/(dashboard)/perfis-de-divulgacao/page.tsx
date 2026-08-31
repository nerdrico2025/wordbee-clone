import { redirect } from "next/navigation";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { PerfisClient } from "@/components/distribuicao/PerfisClient";

export default async function PerfisDeDivulgacaoPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const perfis = await prisma.divulgacaoPerfil.findMany({
    where: { userId: session.user.id },
    orderBy: { nome: "asc" },
    include: { _count: { select: { grupos: true } } },
  });

  return (
    <PerfisClient
      initialPerfis={perfis.map((p) => ({
        id: p.id,
        nome: p.nome,
        observacoes: p.observacoes,
        ativo: p.ativo,
        gruposCount: p._count.grupos,
      }))}
    />
  );
}
