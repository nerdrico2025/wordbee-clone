import { KeyRound } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";

export default function ChavesDeApiPage() {
  return (
    <div>
      <PageHeader
        title="Chaves de API"
        subtitle="Configure suas chaves de IA para gerar artigos e imagens. Todas as chaves são criptografadas (AES-256-GCM)."
      />
      <Tabs defaultValue="texto">
        <TabsList>
          <TabsTrigger value="texto">IAs para Artigos</TabsTrigger>
          <TabsTrigger value="imagem">IAs para Imagens</TabsTrigger>
        </TabsList>
        <TabsContent value="texto">
          <Card>
            <CardContent>
              <EmptyState
                icon={KeyRound}
                title="Nenhuma chave configurada"
                description="Escolha o provedor de IA para geração de texto dos seus artigos. O Gemini é gratuito!"
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="imagem">
          <Card>
            <CardContent>
              <EmptyState
                icon={KeyRound}
                title="Nenhuma chave configurada"
                description="Escolha o provedor de IA para geração de imagens dos seus artigos."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
