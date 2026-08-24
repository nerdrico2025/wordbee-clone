import { PageHeader } from "@/components/layout/PageHeader";
import { getCurrentSession } from "@/lib/auth";
import { ProfileClient } from "@/components/profile/ProfileClient";
import { redirect } from "next/navigation";

export default async function PerfilPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  return (
    <div>
      <PageHeader title="Perfil" subtitle="Gerencie seus dados, segurança e sessões ativas." />
      <ProfileClient
        initialUser={{
          nome: session.user.nome,
          email: session.user.email,
          totpEnabled: session.user.totpEnabled,
        }}
      />
    </div>
  );
}
