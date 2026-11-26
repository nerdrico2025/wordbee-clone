import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { getCurrentSession } from "@/lib/auth";
import { listApiKeyCards } from "@/lib/api-keys";
import { getAiModelsView } from "@/lib/ai-model-settings";
import { ApiKeysClient } from "@/components/api-keys/ApiKeysClient";
import { AiModelsSection } from "@/components/api-keys/AiModelsSection";

export default async function ChavesDeApiPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const [cards, modelos] = await Promise.all([listApiKeyCards(session.user.id), getAiModelsView(session.user.id)]);
  const openRouterConfigurado = cards.texto.some((c) => c.provider === "OPENROUTER" && c.configured && c.statusValidacao);

  return (
    <div>
      <PageHeader
        title="Chaves de API"
        subtitle="Configure suas chaves de IA para gerar artigos e imagens. Todas as chaves são criptografadas (AES-256-GCM)."
      />
      <ApiKeysClient initial={cards} />
      <AiModelsSection initial={modelos} openRouterConfigurado={openRouterConfigurado} />
    </div>
  );
}
