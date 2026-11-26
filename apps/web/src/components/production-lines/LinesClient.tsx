"use client";

import { useState } from "react";
import { Workflow } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LineCard } from "@/components/production-lines/LineCard";
import { NewLineModal } from "@/components/production-lines/NewLineModal";
import type { ProductionLineSummary } from "@/lib/production-line-types";
import type { ProviderOption, SiteOption } from "@/lib/criar-artigo-types";
import { useActiveModels } from "@/components/ai-models/useActiveModels";
import { withActiveModels, type ActiveModelsPayload } from "@/components/ai-models/active-models-logic";

interface Props {
  initialLines: ProductionLineSummary[];
  sites: SiteOption[];
  textProviders: ProviderOption[];
  imageProviders: ProviderOption[];
  canCreate: boolean;
  activeModels: ActiveModelsPayload;
}

export function LinesClient({
  initialLines,
  sites,
  textProviders: textProvidersIniciais,
  imageProviders: imageProvidersIniciais,
  canCreate,
  activeModels: activeModelsIniciais,
}: Props) {
  const [lines, setLines] = useState(initialLines);
  // Revalida o modelo ativo sem F5: ao montar, ao focar a aba e quando
  // Modelos de IA avisa que salvou.
  const ativos = useActiveModels(activeModelsIniciais) ?? activeModelsIniciais;
  const textProviders = withActiveModels(textProvidersIniciais, ativos.texto);
  const imageProviders = withActiveModels(imageProvidersIniciais, ativos.imagem);
  const [modalOpen, setModalOpen] = useState(false);

  function handleChanged(updated: ProductionLineSummary) {
    setLines((prev) => prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)));
  }

  function handleCreated(line: ProductionLineSummary) {
    setLines((prev) => [line, ...prev]);
  }

  return (
    <div>
      <PageHeader
        title="Linhas de Produção"
        subtitle="Crie artigos automaticamente no piloto automático."
        action={
          <Button onClick={() => setModalOpen(true)} disabled={!canCreate} title={!canCreate ? "Cadastre um site e configure as IAs primeiro" : undefined}>
            + Nova Linha
          </Button>
        }
      />

      {lines.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Workflow}
              title="Nenhuma linha de produção"
              description="Crie sua primeira linha para gerar artigos automaticamente."
              action={
                <Button onClick={() => setModalOpen(true)} disabled={!canCreate}>
                  Criar Primeira Linha
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lines.map((line) => (
            <LineCard key={line.id} line={line} onChanged={handleChanged} activeModels={ativos} />
          ))}
        </div>
      )}

      <NewLineModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        sites={sites}
        textProviders={textProviders}
        imageProviders={imageProviders}
        onCreated={handleCreated}
      />
    </div>
  );
}
