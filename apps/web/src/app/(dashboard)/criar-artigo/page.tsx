import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export default function CriarArtigoPage() {
  return (
    <div>
      <PageHeader
        title="Criar Artigo"
        subtitle="Gere e publique um artigo agora mesmo, do título à imagem destacada."
      />
      <Card>
        <CardContent>
          <EmptyState
            icon={Sparkles}
            title="Gerador de artigo em breve"
            description="Cadastre um site WordPress e uma chave de IA para começar a gerar artigos."
          />
        </CardContent>
      </Card>
    </div>
  );
}
