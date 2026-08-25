"use client";

import { useState } from "react";
import Link from "next/link";
import { Globe, Clock, Layers, Pause, Play, Trash2, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { formatInterval } from "@/lib/interval-options";
import { ARTICLE_TYPE_OPTIONS } from "@/lib/article-type-options";
import type { ProductionLineSummary } from "@/lib/production-line-types";

const TYPE_LABELS = Object.fromEntries(ARTICLE_TYPE_OPTIONS.map((t) => [t.value, t.label]));

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function LineCard({ line, onChanged }: { line: ProductionLineSummary; onChanged: (line: ProductionLineSummary) => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function toggle() {
    setLoading(true);
    try {
      const action = line.status === "ATIVA" ? "pause" : "resume";
      const res = await fetch(`/api/production-lines/${line.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onChanged(data.line);
    } catch (err) {
      toast({ title: "Não foi possível atualizar a linha.", description: (err as Error).message, variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/production-lines/${line.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Linha excluída.", variant: "success" });
      onChanged({ ...line, status: "CONCLUIDA" });
      window.location.reload();
    } catch (err) {
      toast({ title: "Não foi possível excluir.", description: (err as Error).message, variant: "error" });
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <div className="flex items-start justify-between gap-2">
          <Link href={`/linhas-de-producao/${line.id}`} className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-zinc-900 hover:underline dark:text-white">{line.nome}</h3>
          </Link>
          <Badge variant={line.status === "ATIVA" ? "success" : line.status === "CONCLUIDA" ? "purple" : "neutral"}>
            {line.status === "ATIVA" ? "Ativa" : line.status === "CONCLUIDA" ? "Concluída" : "Pausada"}
          </Badge>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="flex items-center gap-1">
            <Globe className="h-3.5 w-3.5" /> {line.wpSite?.nome ?? "—"}
          </span>
          <span className="flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" /> {TYPE_LABELS[line.tipoArtigo] ?? line.tipoArtigo}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {formatInterval(line.intervaloMin)}
          </span>
          <span>{line.geradosCount}/{line.maxArtigos ?? "∞"}</span>
        </div>

        <p className="mt-2 truncate text-xs text-zinc-500 dark:text-zinc-400">Tema: {line.temas.join(", ")}</p>

        {line.maxArtigos && (
          <div className="mt-2">
            <ProgressBar value={line.geradosCount} max={line.maxArtigos} />
          </div>
        )}

        <p className="mt-2 text-xs text-zinc-400">
          Último: {formatDateTime(line.lastRunAt)} · Próximo: {line.status === "ATIVA" ? formatDateTime(line.nextRunAt) : "—"}
        </p>
        {line.pauseReason && line.status !== "ATIVA" && <p className="mt-1 text-xs text-amber-600">{line.pauseReason}</p>}

        <div className="mt-4 flex gap-2">
          {line.status !== "CONCLUIDA" && (
            <Button variant="secondary" size="sm" onClick={toggle} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : line.status === "ATIVA" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {line.status === "ATIVA" ? "Pausar" : "Retomar"}
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Excluir linha de produção"
        description={`Tem certeza que deseja excluir "${line.nome}"? Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </Card>
  );
}
