"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Globe, Layers, Clock } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatInterval } from "@/lib/interval-options";
import { ARTICLE_TYPE_OPTIONS } from "@/lib/article-type-options";
import { ReferenceImagesSection } from "@/components/production-lines/ReferenceImagesSection";
import { TitleQueueSection } from "@/components/production-lines/TitleQueueSection";
import { PublishedArticlesSection } from "@/components/production-lines/PublishedArticlesSection";
import type { ProductionLineDetail } from "@/lib/production-line-types";

const TYPE_LABELS = Object.fromEntries(ARTICLE_TYPE_OPTIONS.map((t) => [t.value, t.label]));

export function LineDetailClient({ initial }: { initial: ProductionLineDetail }) {
  const { toast } = useToast();
  const [line, setLine] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/production-lines/${line.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLine(data.line);
    } catch {
      toast({ title: "Não foi possível atualizar.", variant: "error" });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div>
      <Link href="/linhas-de-producao" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{line.nome}</h1>
            <Badge variant={line.status === "ATIVA" ? "success" : line.status === "CONCLUIDA" ? "purple" : "neutral"}>
              {line.status === "ATIVA" ? "Ativa" : line.status === "CONCLUIDA" ? "Concluída" : "Pausada"}
            </Badge>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
            <span className="flex items-center gap-1">
              <Globe className="h-4 w-4" /> {line.wpSite.nome}
            </span>
            <span className="flex items-center gap-1">
              <Layers className="h-4 w-4" /> {TYPE_LABELS[line.tipoArtigo] ?? line.tipoArtigo}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" /> {formatInterval(line.intervaloMin)}
            </span>
            <span>{line.geradosCount}/{line.maxArtigos ?? "∞"}</span>
          </div>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Temas: {line.temas.join(", ")}</p>
        </div>
        <Button variant="secondary" onClick={handleRefresh} loading={refreshing}>
          <RefreshCw className="h-4 w-4" /> Atualizar
        </Button>
      </div>

      <div className="flex flex-col gap-6">
        <ReferenceImagesSection lineId={line.id} images={line.referenceImages} onChange={(referenceImages) => setLine({ ...line, referenceImages })} />
        <TitleQueueSection lineId={line.id} items={line.titleQueue} onChange={(titleQueue) => setLine({ ...line, titleQueue })} />
        <PublishedArticlesSection articles={line.articles} />
      </div>
    </div>
  );
}
