"use client";

import { useState } from "react";
import { Facebook, CheckCircle2, XCircle, Pencil, Trash2, Loader2, Link2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import type { FacebookPageSummary } from "@/lib/facebook-pages-types";

export function FacebookPageCard({
  page,
  onEdit,
  onDeleted,
}: {
  page: FacebookPageSummary;
  onEdit: () => void;
  onDeleted: (id: string) => void;
}) {
  const { toast } = useToast();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string } | null>(
    page.lastValidatedAt ? { ok: page.statusValidacao, message: page.lastError ?? undefined } : null
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleTest() {
    setTesting(true);
    try {
      const res = await fetch(`/api/facebook-pages/${page.id}/test`, { method: "POST" });
      const data = await res.json();
      setTestResult({ ok: data.ok, message: data.error });
      toast({
        title: data.ok ? "Token válido, conexão OK." : "Falha na conexão com o Facebook.",
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
      const res = await fetch(`/api/facebook-pages/${page.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível excluir a Página.");
      onDeleted(page.id);
      toast({ title: "Página excluída.", variant: "success" });
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
            <Facebook className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-zinc-900 dark:text-white">{page.nome}</h3>
            <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">ID: {page.pageId}</p>
            <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">Token: {page.maskedHint}</p>
          </div>
        </div>

        <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <Link2 className="h-3.5 w-3.5 shrink-0" />
          {page.wpSiteNome ? (
            <>
              Publica artigos de <span className="font-medium text-zinc-700 dark:text-zinc-200">{page.wpSiteNome}</span>
            </>
          ) : (
            "Publica artigos de qualquer site"
          )}
        </p>

        {testResult && (
          <p className={`mt-2 flex items-start gap-1.5 text-xs ${testResult.ok ? "text-emerald-600" : "text-red-600"}`}>
            {testResult.ok ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
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
        title="Excluir Página do Facebook"
        description={`Tem certeza que deseja excluir "${page.nome}"? O histórico de publicações do Wordbee nessa Página também é apagado (os posts já publicados continuam no Facebook). Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </Card>
  );
}
