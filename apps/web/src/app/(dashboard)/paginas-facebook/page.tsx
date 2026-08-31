import { redirect } from "next/navigation";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { FACEBOOK_PAGE_SELECT, toFacebookPageSummary } from "@/lib/facebook-pages";
import { FacebookPagesClient } from "@/components/facebook-pages/FacebookPagesClient";

export default async function PaginasFacebookPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const [pages, sites] = await Promise.all([
    prisma.facebookPage.findMany({
      where: { userId: session.user.id },
      orderBy: { nome: "asc" },
      select: FACEBOOK_PAGE_SELECT,
    }),
    prisma.wpSite.findMany({
      where: { userId: session.user.id },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
  ]);

  return <FacebookPagesClient initialPages={pages.map(toFacebookPageSummary)} sites={sites} />;
}
