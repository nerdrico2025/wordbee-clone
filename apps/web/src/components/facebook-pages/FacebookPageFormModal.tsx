"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input, PasswordInput } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { FacebookPageSummary, WpSiteOption } from "@/lib/facebook-pages-types";

const SEM_VINCULO = "";

export function FacebookPageFormModal({
  open,
  onOpenChange,
  page,
  sites,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: FacebookPageSummary | null;
  sites: WpSiteOption[];
  onSaved: (page: FacebookPageSummary) => void;
}) {
  const { toast } = useToast();
  const isEdit = !!page;
  const [nome, setNome] = useState("");
  const [pageId, setPageId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [wpSiteId, setWpSiteId] = useState<string>(SEM_VINCULO);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setNome(page?.nome ?? "");
      setPageId(page?.pageId ?? "");
      setAccessToken("");
      setWpSiteId(page?.wpSiteId ?? SEM_VINCULO);
      setError(null);
    }
  }, [open, page]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, string | null> = { nome, pageId, wpSiteId: wpSiteId || null };
      // Na edição, um campo de token vazio significa "manter o token atual"
      // — mesmo comportamento da senha de aplicação dos Sites WordPress.
      if (accessToken || !isEdit) body.accessToken = accessToken;

      const res = await fetch(isEdit ? `/api/facebook-pages/${page!.id}` : "/api/facebook-pages", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível salvar a Página.");
      onSaved(data.page);
      onOpenChange(false);
      toast({ title: isEdit ? "Página atualizada." : "Página cadastrada.", variant: "success" });
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      toast({ title: "Não foi possível salvar a Página.", description: message, variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Editar Página do Facebook" : "Nova Página do Facebook"}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="facebook-page-form" loading={loading}>
            {isEdit ? "Salvar" : "Cadastrar"}
          </Button>
        </>
      }
    >
      <form id="facebook-page-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Nome de exibição"
          hint="Só para você identificar a Página aqui dentro."
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required
        />
        <Input
          label="ID da Página"
          placeholder="102938475610293"
          hint="Só números. Encontre em Configurações da Página → Sobre → Identificação da Página."
          value={pageId}
          onChange={(e) => setPageId(e.target.value)}
          inputMode="numeric"
          required
        />
        <PasswordInput
          label="Token de acesso da Página"
          placeholder="EAA..."
          hint={
            isEdit
              ? "Deixe em branco para manter o token atual. Ao salvar, o token é testado no Facebook antes de ser gravado."
              : "Gere em developers.facebook.com → Graph API Explorer (token de Página, com permissão de publicação). Ao salvar, ele é testado no Facebook antes de ser gravado."
          }
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          required={!isEdit}
        />
        <Select
          label="Blog vinculado (opcional)"
          hint="Se escolher um blog, esta Página só recebe artigos dele. Sem vínculo, recebe artigos de qualquer site."
          value={wpSiteId}
          onChange={(e) => setWpSiteId(e.target.value)}
        >
          <option value={SEM_VINCULO}>Todos os sites</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.nome}
            </option>
          ))}
        </Select>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
