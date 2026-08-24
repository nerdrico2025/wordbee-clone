import { redirect } from "next/navigation";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { listConfiguredProviders } from "@/lib/api-keys";
import { LinesClient } from "@/components/production-lines/LinesClient";

export default async function LinhasDeProducaoPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const userId = session.user.id;
  const [lines, sites, textProviders, imageProviders] = await Promise.all([
    prisma.productionLine.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { wpSite: { select: { nome: true } } },
    }),
    prisma.wpSite.findMany({ where: { userId }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    listConfiguredProviders(userId, "TEXTO"),
    listConfiguredProviders(userId, "IMAGEM"),
  ]);

  const canCreate = sites.length > 0 && textProviders.length > 0 && imageProviders.length > 0;

  return (
    <LinesClient
      initialLines={lines.map((l) => ({
        id: l.id,
        nome: l.nome,
        status: l.status,
        wpSite: l.wpSite,
        tipoArtigo: l.tipoArtigo,
        intervaloMin: l.intervaloMin,
        temas: l.temas,
        maxArtigos: l.maxArtigos,
        geradosCount: l.geradosCount,
        lastRunAt: l.lastRunAt?.toISOString() ?? null,
        nextRunAt: l.nextRunAt?.toISOString() ?? null,
        pauseReason: l.pauseReason,
      }))}
      sites={sites}
      textProviders={textProviders}
      imageProviders={imageProviders}
      canCreate={canCreate}
    />
  );
}
