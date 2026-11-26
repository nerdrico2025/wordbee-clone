"use client";

import { useEffect, useState } from "react";
import { Cpu, FlaskConical, RotateCcw } from "lucide-react";
import type { OpenRouterModelInfo } from "@wordbee/shared";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { AiModelSlotView, AiModelsView } from "@/lib/ai-model-settings";
import { ModelCombobox } from "./ModelCombobox";
import { formatContext, formatModelPrice } from "./model-combobox-logic";

type Tipo = "texto" | "imagem";

const ORIGEM_LABEL: Record<AiModelSlotView["origem"], string> = {
  painel: "escolhido aqui",
  env: "definido no servidor",
  padrao: "padrão do sistema",
};

function useCatalog(tipo: Tipo) {
  const [modelos, setModelos] = useState<OpenRouterModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/settings/ai-models/catalog?tipo=${tipo}`)
      .then((res) => res.json())
      .then((data: { modelos?: OpenRouterModelInfo[]; erro?: string }) => {
        if (cancelled) return;
        setModelos(data.modelos ?? []);
        setErro(data.erro ?? null);
      })
      .catch(() => !cancelled && setErro("Não foi possível carregar a lista de modelos agora. Você ainda pode digitar o ID."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tipo]);

  return { modelos, loading, erro };
}

function ModelField({
  tipo,
  slot,
  value,
  onChange,
  catalog,
  openRouterConfigurado,
}: {
  tipo: Tipo;
  slot: AiModelSlotView;
  value: string;
  onChange: (v: string) => void;
  catalog: ReturnType<typeof useCatalog>;
  openRouterConfigurado: boolean;
}) {
  const { toast } = useToast();
  const [testing, setTesting] = useState(false);
  const label = tipo === "texto" ? "Modelo de texto" : "Modelo de imagem";
  const efetivo = value.trim() || slot.padrao;
  const info = catalog.modelos.find((m) => m.id === efetivo);
  const preco = info ? formatModelPrice(info) : null;
  const contexto = info && tipo === "texto" ? formatContext(info.contexto) : null;

  async function handleTest() {
    setTesting(true);
    try {
      const res = await fetch("/api/settings/ai-models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, modelId: efetivo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível testar o modelo.");
      toast({
        title: data.ok ? "Modelo funcionando." : "O modelo não passou no teste.",
        description: data.mensagem,
        variant: data.ok ? "success" : "error",
      });
    } catch (err) {
      toast({ title: "Não foi possível testar o modelo.", description: (err as Error).message, variant: "error" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <ModelCombobox
        id={`modelo-${tipo}`}
        label={label}
        value={value}
        onChange={onChange}
        models={catalog.modelos}
        loading={catalog.loading}
        placeholder={`Padrão: ${slot.padrao}`}
        hint={catalog.erro ?? "Escolha da lista ou digite o ID do modelo. Deixe vazio para usar o padrão."}
      />
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        Em uso hoje: <span className="font-mono">{slot.emUso}</span>{" "}
        <span className="text-zinc-500 dark:text-zinc-400">({ORIGEM_LABEL[slot.origem]})</span>
      </p>
      {(preco || contexto) && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {[preco, contexto].filter(Boolean).join(" · ")}
        </p>
      )}
      <div>
        <Button type="button" variant="secondary" size="sm" loading={testing} disabled={!openRouterConfigurado} onClick={handleTest}>
          <FlaskConical className="h-3.5 w-3.5" /> Testar modelo
        </Button>
      </div>
    </div>
  );
}

export function AiModelsSection({ initial, openRouterConfigurado }: { initial: AiModelsView; openRouterConfigurado: boolean }) {
  const { toast } = useToast();
  const [view, setView] = useState(initial);
  const [textModel, setTextModel] = useState(initial.texto.salvo ?? "");
  const [imageModel, setImageModel] = useState(initial.imagem.salvo ?? "");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const textCatalog = useCatalog("texto");
  const imageCatalog = useCatalog("imagem");

  async function save(body: { textModel: string | null; imageModel: string | null }, reset: boolean) {
    const setBusy = reset ? setResetting : setSaving;
    setBusy(true);
    try {
      const res = await fetch("/api/settings/ai-models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível salvar os modelos.");
      setView(data);
      setTextModel(data.texto.salvo ?? "");
      setImageModel(data.imagem.salvo ?? "");
      toast({
        title: reset ? "Modelos voltaram ao padrão." : "Modelos salvos.",
        description: "Vale a partir da próxima geração, inclusive nas Linhas de Produção (em até 2 minutos).",
        variant: "success",
      });
    } catch (err) {
      toast({ title: "Não foi possível salvar os modelos.", description: (err as Error).message, variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  const semAlteracao = textModel.trim() === (view.texto.salvo ?? "") && imageModel.trim() === (view.imagem.salvo ?? "");
  const usandoPadrao = !view.texto.salvo && !view.imagem.salvo;

  return (
    <section aria-labelledby="modelos-ia-titulo" className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <Cpu className="h-5 w-5 text-primary-600" aria-hidden />
        <h2 id="modelos-ia-titulo" className="text-lg font-semibold text-zinc-900 dark:text-white">
          Modelos de IA
        </h2>
        <Badge variant="purple">OpenRouter</Badge>
      </div>
      <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
        Escolha qual modelo do OpenRouter escreve os artigos e qual gera as imagens. A troca vale para tudo que usa o
        OpenRouter (Criar Artigo e Linhas de Produção), sem precisar reiniciar nada.
      </p>

      <Card>
        <CardContent>
          {!openRouterConfigurado && (
            <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
              Cadastre a chave do OpenRouter acima para testar os modelos. Você já pode escolher e salvar.
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save({ textModel: textModel.trim() || null, imageModel: imageModel.trim() || null }, false);
            }}
          >
            <div className="grid gap-6 md:grid-cols-2">
              <ModelField
                tipo="texto"
                slot={view.texto}
                value={textModel}
                onChange={setTextModel}
                catalog={textCatalog}
                openRouterConfigurado={openRouterConfigurado}
              />
              <ModelField
                tipo="imagem"
                slot={view.imagem}
                value={imageModel}
                onChange={setImageModel}
                catalog={imageCatalog}
                openRouterConfigurado={openRouterConfigurado}
              />
            </div>
            <div className="mt-6 flex flex-wrap gap-2 border-t border-zinc-100 pt-4 dark:border-graphite-700/60">
              <Button type="submit" loading={saving} disabled={semAlteracao || resetting}>
                Salvar
              </Button>
              <Button
                type="button"
                variant="ghost"
                loading={resetting}
                disabled={usandoPadrao || saving}
                onClick={() => save({ textModel: null, imageModel: null }, true)}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Voltar ao padrão
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
