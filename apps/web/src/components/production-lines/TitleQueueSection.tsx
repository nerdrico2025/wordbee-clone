"use client";

import { useState } from "react";
import { ListPlus, Pencil, Check, X } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import type { TitleQueueItemSummary } from "@/lib/production-line-types";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function TitleQueueSection({
  lineId,
  items,
  onChange,
}: {
  lineId: string;
  items: TitleQueueItemSummary[];
  onChange: (items: TitleQueueItemSummary[]) => void;
}) {
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/production-lines/${lineId}/titles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantidade: 3 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível gerar títulos.");
      onChange(data.titleQueue);
      toast({ title: "Títulos gerados.", variant: "success" });
    } catch (err) {
      toast({ title: "Erro ao gerar títulos.", description: (err as Error).message, variant: "error" });
    } finally {
      setGenerating(false);
    }
  }

  function startEdit(item: TitleQueueItemSummary) {
    setEditingId(item.id);
    setEditValue(item.titulo);
  }

  async function saveEdit(itemId: string) {
    if (!editValue.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/production-lines/${lineId}/titles/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: editValue.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível salvar o título.");
      onChange(items.map((i) => (i.id === itemId ? data.item : i)));
      setEditingId(null);
    } catch (err) {
      toast({ title: "Erro ao salvar título.", description: (err as Error).message, variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Fila de Títulos ({items.length} na fila)</CardTitle>
            <CardDescription>
              Clique em um título para editá-lo antes da publicação. Novos títulos são gerados automaticamente após cada artigo publicado.
            </CardDescription>
          </div>
          <Button variant="secondary" size="sm" onClick={handleGenerate} loading={generating}>
            <ListPlus className="h-3.5 w-3.5" /> Gerar Títulos
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">Nenhum título na fila.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-zinc-100 dark:divide-graphite-700/60">
            {items.map((item, index) => (
              <li key={item.id} className="flex items-center gap-3 py-3">
                <span className="w-5 shrink-0 text-sm text-zinc-400">{index + 1}.</span>
                {editingId === item.id ? (
                  <div className="flex flex-1 items-center gap-2">
                    <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} className="flex-1" autoFocus />
                    <button onClick={() => saveEdit(item.id)} disabled={saving} className="text-emerald-600" aria-label="Salvar">
                      <Check className="h-4 w-4" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-zinc-400" aria-label="Cancelar">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => startEdit(item)} className="flex flex-1 items-center justify-between gap-2 text-left group">
                    <span className="text-sm text-zinc-800 dark:text-zinc-100">{item.titulo}</span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-zinc-400 opacity-0 group-hover:opacity-100">
                      <Pencil className="h-3 w-3" /> Previsto: {formatDateTime(item.previstoPara)}
                    </span>
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
