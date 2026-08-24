import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { DashboardShell } from "@/components/layout/DashboardShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }

  return <DashboardShell user={{ nome: session.user.nome, email: session.user.email }}>{children}</DashboardShell>;
}
