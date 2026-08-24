import { redirect } from "next/navigation";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { SitesClient } from "@/components/wp-sites/SitesClient";

export default async function SitesWordpressPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const sites = await prisma.wpSite.findMany({
    where: { userId: session.user.id },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, url: true, usuario: true, lastTestAt: true, lastTestOk: true, lastTestError: true },
  });

  return (
    <SitesClient
      initialSites={sites.map((s) => ({
        ...s,
        lastTestAt: s.lastTestAt?.toISOString() ?? null,
      }))}
    />
  );
}
