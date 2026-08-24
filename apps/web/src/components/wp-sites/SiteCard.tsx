"use client";

import { useState } from "react";
import { Globe, CheckCircle2, XCircle, Pencil, Trash2, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import type { WpSiteSummary } from "@/lib/wp-sites-types";

export function SiteCard({
  site,
  onEdit,
  onDeleted,
}: {
  site: WpSiteSummary;
  onEdit: () => void;
  onDeleted: (id: string) => void;
}) {
  const { toast } = useToast();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string } | null>(
    site.lastTestAt ? { ok: !!site.lastTestOk, message: site.lastTestError ?? undefined } : null
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleTest() {
    setTesting(true);
    try {
      const res = await fetch(`/api/wp-sites/${site.id}/test`, { method: "POST" });
      const data = await res.json();
      setTestResult({ ok: data.ok, message: data.error });
      toast({
        title: data.ok ? "Conexão bem-sucedida." : "Falha na conexão.",
        description: data.error,
        variant: data.ok ? "success" : "error",
      });
    } catch {
      toast({ title: "Erro ao testar conexão.", variant: "error" });
    } finally {
      setTesting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/wp-sites/${site.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível excluir o site.");
      onDeleted(site.id);
      toast({ title: "Site excluído.", variant: "success" });
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
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">
            <Globe className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-zinc-900 dark:text-white">{site.nome}</h3>
            <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">{site.url}</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">Usuário: {site.usuario}</p>
          </div>
        </div>

        {testResult && (
          <p className={`mt-2 flex items-center gap-1.5 text-xs ${testResult.ok ? "text-emerald-600" : "text-red-600"}`}>
            {testResult.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
            {testResult.ok ? "Conexão OK" : testResult.message}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={handleTest} disabled={testing}>
            {testing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Testar
          </Button>
          <Button variant="secondary" size="sm" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" /> Editar
          </Button>
          <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </Button>
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Excluir site WordPress"
        description={`Tem certeza que deseja excluir "${site.nome}"? Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </Card>
  );
}
