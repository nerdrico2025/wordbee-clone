"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Handshake, Pencil, Trash2, ExternalLink, Users, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { GrupoFormModal } from "@/components/distribuicao/GrupoFormModal";
import { GrupoPerfisModal } from "@/components/distribuicao/GrupoPerfisModal";
import {
  formatarCentavos,
  GRUPO_STATUS_LABEL,
  podeEntrarNaFila,
  type GrupoParceiroSummary,
} from "@/lib/distribution-types";

export interface PerfilOption {
  id: string;
  nome: string;
  ativo: boolean;
}

export function GruposClient({
  initialGrupos,
  perfis,
}: {
  initialGrupos: GrupoParceiroSummary[];
  perfis: PerfilOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [grupos, setGrupos] = useState(initialGrupos);
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<GrupoParceiroSummary | null>(null);
  const [gerenciando, setGerenciando] = useState<GrupoParceiroSummary | null>(null);
  const [excluindo, setExcluindo] = useState<GrupoParceiroSummary | null>(null);
  const [removendo, setRemovendo] = useState(false);

  function aoSalvar(grupo: GrupoParceiroSummary) {
    setGrupos((prev) => {
      const existe = prev.some((g) => g.id === grupo.id);
      const proximo = existe ? prev.map((g) => (g.id === grupo.id ? grupo : g)) : [...prev, grupo];
      return proximo.sort((a, b) => a.nome.localeCompare(b.nome));
    });
    setGerenciando((atual) => (atual && atual.id === grupo.id ? grupo : atual));
    // Mudar um grupo (status da parceria, quem está dentro dele) muda as
    // combinações válidas em "Distribuir nos grupos" e os números do
    // Painel — rotas que o Router Cache do Next já pode ter guardado.
    router.refresh();
  }

  async function excluir() {
    if (!excluindo) return;
    setRemovendo(true);
    try {
      const res = await fetch(`/api/grupos-parceiros/${excluindo.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Não foi possível excluir o grupo.");
      setGrupos((prev) => prev.filter((g) => g.id !== excluindo.id));
      toast({ title: "Grupo excluído.", variant: "success" });
      router.refresh();
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
        title="Grupos Parceiros"
        subtitle="Grupos do Facebook onde existe acordo comercial com o dono — os únicos onde a divulgação acontece."
        action={
          <Button
            onClick={() => {
              setEditando(null);
              setFormOpen(true);
            }}
          >
            + Novo grupo
          </Button>
        }
      />

      {grupos.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Handshake}
              title="Nenhum grupo parceiro cadastrado"
              description="Cadastre os grupos com os quais você tem acordo de parceria, e quais perfis participam de cada um."
              action={
                <Button
                  onClick={() => {
                    setEditando(null);
                    setFormOpen(true);
                  }}
                >
                  Cadastrar grupo
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {grupos.map((grupo) => {
            const dentro = grupo.perfis.filter((p) => podeEntrarNaFila(p.status));
            return (
              <Card key={grupo.id}>
                <CardContent>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-zinc-900 dark:text-white">{grupo.nome}</h3>
                      <a
                        href={grupo.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 inline-flex items-center gap-1 truncate text-xs text-primary-600 hover:underline dark:text-primary-300"
                      >
                        Abrir grupo <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <Badge
                      variant={grupo.status === "ATIVO" ? "success" : grupo.status === "PAUSADO" ? "warning" : "neutral"}
                    >
                      {GRUPO_STATUS_LABEL[grupo.status]}
                    </Badge>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div>
                      <dt className="text-zinc-400 dark:text-zinc-500">Valor da parceria</dt>
                      <dd className="font-medium text-zinc-700 dark:text-zinc-200">
                        {grupo.valorPagoCentavos > 0 ? `${formatarCentavos(grupo.valorPagoCentavos)}/mês` : "Sem pagamento"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-400 dark:text-zinc-500">Vigência</dt>
                      <dd className="font-medium text-zinc-700 dark:text-zinc-200">
                        {formatarData(grupo.periodoInicio)}
                        {grupo.periodoFim ? ` – ${formatarData(grupo.periodoFim)}` : " – sem fim definido"}
                      </dd>
                    </div>
                    {grupo.membrosAprox != null && (
                      <div>
                        <dt className="text-zinc-400 dark:text-zinc-500">Membros (aprox.)</dt>
                        <dd className="font-medium text-zinc-700 dark:text-zinc-200">
                          {grupo.membrosAprox.toLocaleString("pt-BR")}
                        </dd>
                      </div>
                    )}
                    {grupo.adminContato && (
                      <div>
                        <dt className="text-zinc-400 dark:text-zinc-500">Administrador</dt>
                        <dd className="truncate font-medium text-zinc-700 dark:text-zinc-200">{grupo.adminContato}</dd>
                      </div>
                    )}
                  </dl>

                  {!grupo.confirmaDivulgacaoParceria && (
                    <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      O dono ainda não confirmou que avisa aos membros que é uma parceria. É essa transparência que separa
                      publicidade legítima de publicidade velada.
                    </p>
                  )}

                  <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                    <Users className="h-3.5 w-3.5" />
                    {dentro.length === 0
                      ? "Nenhum perfil dentro do grupo ainda"
                      : `${dentro.length} perfil(is) dentro: ${dentro.map((p) => p.perfilNome).join(", ")}`}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setGerenciando(grupo)}>
                      <Users className="h-3.5 w-3.5" /> Perfis do grupo
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setEditando(grupo);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-50"
                      onClick={() => setExcluindo(grupo)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <GrupoFormModal open={formOpen} onOpenChange={setFormOpen} grupo={editando} onSaved={aoSalvar} />

      <GrupoPerfisModal
        open={!!gerenciando}
        onOpenChange={(open) => !open && setGerenciando(null)}
        grupo={gerenciando}
        perfis={perfis}
        onChanged={aoSalvar}
      />

      <ConfirmDialog
        open={!!excluindo}
        onOpenChange={(open) => !open && setExcluindo(null)}
        title="Excluir grupo parceiro"
        description={`Excluir "${excluindo?.nome}" apaga também os vínculos com os perfis e o histórico de postagens nesse grupo. Se a parceria só acabou, prefira mudar o status para Encerrado — o histórico fica preservado.`}
        confirmLabel="Excluir mesmo assim"
        loading={removendo}
        onConfirm={excluir}
      />
    </div>
  );
}

function formatarData(iso: string): string {
  // A data vem como rótulo de dia (YYYY-MM-DD). Formatar via `new Date`
  // aplicaria o fuso do navegador e poderia mostrar o dia anterior.
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}
