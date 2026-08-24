import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { getCurrentSession } from "@/lib/auth";
import { listApiKeyCards } from "@/lib/api-keys";
import { ApiKeysClient } from "@/components/api-keys/ApiKeysClient";

export default async function ChavesDeApiPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const cards = await listApiKeyCards(session.user.id);

  return (
    <div>
      <PageHeader
        title="Chaves de API"
        subtitle="Configure suas chaves de IA para gerar artigos e imagens. Todas as chaves são criptografadas (AES-256-GCM)."
      />
      <ApiKeysClient initial={cards} />
    </div>
  );
}
