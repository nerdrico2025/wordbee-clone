"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input, PasswordInput } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { WpSiteSummary } from "@/lib/wp-sites-types";

export function SiteFormModal({
  open,
  onOpenChange,
  site,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site: WpSiteSummary | null;
  onSaved: (site: WpSiteSummary) => void;
}) {
  const { toast } = useToast();
  const isEdit = !!site;
  const [nome, setNome] = useState("");
  const [url, setUrl] = useState("");
  const [usuario, setUsuario] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setNome(site?.nome ?? "");
      setUrl(site?.url ?? "");
      setUsuario(site?.usuario ?? "");
      setAppPassword("");
      setError(null);
    }
  }, [open, site]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, string> = { nome, url, usuario };
      if (appPassword || !isEdit) body.appPassword = appPassword;

      const res = await fetch(isEdit ? `/api/wp-sites/${site!.id}` : "/api/wp-sites", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível salvar o site.");
      onSaved(data.site);
      onOpenChange(false);
      toast({ title: isEdit ? "Site atualizado." : "Site cadastrado.", variant: "success" });
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      toast({ title: "Não foi possível salvar o site.", description: message, variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Editar site WordPress" : "Novo site WordPress"}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="site-form" loading={loading}>
            {isEdit ? "Salvar" : "Cadastrar"}
          </Button>
        </>
      }
    >
      <form id="site-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input label="Nome de exibição" value={nome} onChange={(e) => setNome(e.target.value)} required />
        <Input
          label="URL"
          type="url"
          placeholder="https://meublog.com.br"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <Input
          label="Usuário"
          hint="Precisa ser um usuário com perfil Administrador."
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          required
        />
        <PasswordInput
          label="Senha de aplicação"
          placeholder="xxxx xxxx xxxx xxxx"
          hint="Gere em WordPress → Usuários → Perfil → Senhas de aplicação."
          value={appPassword}
          onChange={(e) => setAppPassword(e.target.value)}
          required={!isEdit}
        />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
