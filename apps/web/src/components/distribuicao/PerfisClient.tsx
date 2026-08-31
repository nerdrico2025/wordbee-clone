"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Users, Pencil, Trash2, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Switch } from "@/components/ui/Switch";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import type { DivulgacaoPerfilSummary } from "@/lib/distribution-types";

export function PerfisClient({ initialPerfis }: { initialPerfis: DivulgacaoPerfilSummary[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [perfis, setPerfis] = useState(initialPerfis);

  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<DivulgacaoPerfilSummary | null>(null);
  const [excluindo, setExcluindo] = useState<DivulgacaoPerfilSummary | null>(null);
  const [removendo, setRemovendo] = useState(false);

  /**
   * A lista desta tela é atualizada em estado local (resposta imediata),
   * mas um perfil criado/desativado muda dados de OUTRAS rotas já em cache
   * no Router Cache do Next — as combinações oferecidas em "Distribuir nos
   * grupos", os filtros da Fila e os números do Painel. Sem invalidar,
   * navegar para lá mostraria a lista velha.
   */
  function revalidarRotasDependentes() {
    router.refresh();
  }

  function abrirCriacao() {
    setEditando(null);
    setModalOpen(true);
  }

  function aoSalvar(perfil: DivulgacaoPerfilSummary) {
    setPerfis((prev) => {
      const existe = prev.some((p) => p.id === perfil.id);
      const proximo = existe ? prev.map((p) => (p.id === perfil.id ? perfil : p)) : [...prev, perfil];
      return proximo.sort((a, b) => a.nome.localeCompare(b.nome));
    });
    revalidarRotasDependentes();
  }

  async function alternarAtivo(perfil: DivulgacaoPerfilSummary, ativo: boolean) {
    const anterior = perfis;
    setPerfis((prev) => prev.map((p) => (p.id === perfil.id ? { ...p, ativo } : p)));
    try {
      const res = await fetch(`/api/divulgacao-perfis/${perfil.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Não foi possível atualizar o perfil.");
      toast({ title: ativo ? "Perfil ativado." : "Perfil desativado.", variant: "success" });
      revalidarRotasDependentes();
    } catch (err) {
      setPerfis(anterior);
      toast({ title: "Não foi possível atualizar.", description: (err as Error).message, variant: "error" });
    }
  }

  async function excluir() {
    if (!excluindo) return;
    setRemovendo(true);
    try {
      const res = await fetch(`/api/divulgacao-perfis/${excluindo.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Não foi possível excluir o perfil.");
      setPerfis((prev) => prev.filter((p) => p.id !== excluindo.id));
      toast({ title: "Perfil excluído.", variant: "success" });
      revalidarRotasDependentes();
    } catch (err) {
      toast({ title: "Não foi possível excluir.", description: (err as Error).message, variant: "error" });
    } finally {
      setRemovendo(false);
      setExcluindo(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Perfis de Divulgação"
        subtitle="As pessoas reais que ajudam a divulgar, postando manualmente nos grupos de que já participam."
        action={<Button onClick={abrirCriacao}>+ Novo perfil</Button>}
      />

      <Card className="mb-6 border-primary-100 bg-primary-50/60 dark:border-primary-500/20 dark:bg-primary-500/5">
        <CardContent>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Isto é uma agenda, não um acesso</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            O Wordbee não guarda login, senha nem sessão de ninguém, e nunca posta no lugar de uma pessoa. Um perfil aqui é só
            um nome, para o app saber a quem atribuir cada tarefa do dia — a postagem no grupo é sempre feita pela própria
            pessoa, no navegador dela.
          </p>
        </CardContent>
      </Card>

      {perfis.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Users}
              title="Nenhum perfil cadastrado"
              description="Cadastre as pessoas que vão ajudar na divulgação para montar a fila de trabalho do dia."
              action={<Button onClick={abrirCriacao}>Cadastrar perfil</Button>}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {perfis.map((perfil) => (
            <Card key={perfil.id}>
              <CardContent>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-zinc-900 dark:text-white">{perfil.nome}</h3>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                      <UsersRound className="h-3.5 w-3.5" />
                      {perfil.gruposCount === 1 ? "1 grupo" : `${perfil.gruposCount} grupos`}
                    </p>
                  </div>
                  <Badge variant={perfil.ativo ? "success" : "neutral"}>{perfil.ativo ? "Ativo" : "Inativo"}</Badge>
                </div>

                {perfil.observacoes && (
                  <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-300">{perfil.observacoes}</p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <label className="mr-auto flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                    <Switch
                      checked={perfil.ativo}
                      onCheckedChange={(v) => alternarAtivo(perfil, v)}
                      aria-label={`Ativar ou desativar ${perfil.nome}`}
                    />
                    Recebe tarefas
                  </label>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setEditando(perfil);
                      setModalOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => setExcluindo(perfil)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PerfilFormModal open={modalOpen} onOpenChange={setModalOpen} perfil={editando} onSaved={aoSalvar} />

      <ConfirmDialog
        open={!!excluindo}
        onOpenChange={(open) => !open && setExcluindo(null)}
        title="Excluir perfil de divulgação"
        description={`Excluir "${excluindo?.nome}" apaga também o histórico de postagens dessa pessoa e os vínculos dela com os grupos. Se ela só parou de ajudar, prefira desativar — o histórico fica preservado.`}
        confirmLabel="Excluir mesmo assim"
        loading={removendo}
        onConfirm={excluir}
      />
    </div>
  );
}

function PerfilFormModal({
  open,
  onOpenChange,
  perfil,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  perfil: DivulgacaoPerfilSummary | null;
  onSaved: (perfil: DivulgacaoPerfilSummary) => void;
}) {
  const { toast } = useToast();
  const isEdit = !!perfil;
  const [nome, setNome] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) {
      setNome(perfil?.nome ?? "");
      setObservacoes(perfil?.observacoes ?? "");
      setErro(null);
    }
  }, [open, perfil]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch(isEdit ? `/api/divulgacao-perfis/${perfil!.id}` : "/api/divulgacao-perfis", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, observacoes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível salvar o perfil.");
      onSaved(data.perfil);
      onOpenChange(false);
      toast({ title: isEdit ? "Perfil atualizado." : "Perfil cadastrado.", variant: "success" });
    } catch (err) {
      const message = (err as Error).message;
      setErro(message);
      toast({ title: "Não foi possível salvar.", description: message, variant: "error" });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Editar perfil de divulgação" : "Novo perfil de divulgação"}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="perfil-form" loading={salvando}>
            {isEdit ? "Salvar" : "Cadastrar"}
          </Button>
        </>
      }
    >
      <form id="perfil-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Nome da pessoa"
          hint="Como você identifica essa pessoa (ex.: 'Tia Márcia')."
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required
        />
        <Textarea
          label="Observações (opcional)"
          hint="A quem pertence, nicho, combinados de cadência — o que ajudar você a lembrar."
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
        />
        {erro && (
          <p role="alert" className="text-sm text-red-600">
            {erro}
          </p>
        )}
      </form>
    </Modal>
  );
}
