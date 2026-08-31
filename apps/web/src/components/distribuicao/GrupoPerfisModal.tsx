"use client";

import { useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import {
  PERFIL_GRUPO_STATUS_LABEL,
  podeEntrarNaFila,
  type GrupoParceiroSummary,
  type PerfilGrupoStatusValue,
} from "@/lib/distribution-types";
import type { PerfilOption } from "@/components/distribuicao/GruposClient";

/**
 * Gestão de quem participa de um grupo parceiro — o equivalente, dentro do
 * Wordbee, da planilha de controle mostrada nas aulas. Só cadastro: nada
 * aqui dispara postagem, nem guarda credencial de conta.
 */
export function GrupoPerfisModal({
  open,
  onOpenChange,
  grupo,
  perfis,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  grupo: GrupoParceiroSummary | null;
  perfis: PerfilOption[];
  onChanged: (grupo: GrupoParceiroSummary) => void;
}) {
  const { toast } = useToast();
  const [perfilSelecionado, setPerfilSelecionado] = useState("");
  const [salvando, setSalvando] = useState(false);

  if (!grupo) return null;

  const jaVinculados = new Set(grupo.perfis.map((p) => p.perfilId));
  const disponiveis = perfis.filter((p) => !jaVinculados.has(p.id));

  async function chamar(url: string, init: RequestInit, sucesso: string) {
    setSalvando(true);
    try {
      const res = await fetch(url, init);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível atualizar.");
      onChanged(data.grupo);
      toast({ title: sucesso, variant: "success" });
    } catch (err) {
      toast({ title: "Não foi possível atualizar.", description: (err as Error).message, variant: "error" });
    } finally {
      setSalvando(false);
    }
  }

  async function adicionar() {
    if (!perfilSelecionado) return;
    await chamar(
      `/api/grupos-parceiros/${grupo!.id}/perfis`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ divulgacaoPerfilId: perfilSelecionado, status: "AGUARDANDO_APROVACAO" }),
      },
      "Perfil vinculado ao grupo."
    );
    setPerfilSelecionado("");
  }

  async function mudarStatus(perfilId: string, status: PerfilGrupoStatusValue) {
    await chamar(
      `/api/grupos-parceiros/${grupo!.id}/perfis`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ divulgacaoPerfilId: perfilId, status }),
      },
      "Situação atualizada."
    );
  }

  async function remover(perfilId: string) {
    await chamar(`/api/grupos-parceiros/${grupo!.id}/perfis/${perfilId}`, { method: "DELETE" }, "Vínculo removido.");
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Perfis em "${grupo.nome}"`}
      description="Só perfis que já estão dentro do grupo podem receber tarefas de postagem nele."
      footer={
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Fechar
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {disponiveis.length > 0 && (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Select
                label="Adicionar perfil"
                value={perfilSelecionado}
                onChange={(e) => setPerfilSelecionado(e.target.value)}
              >
                <option value="">Selecione uma pessoa...</option>
                {disponiveis.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                    {p.ativo ? "" : " (inativo)"}
                  </option>
                ))}
              </Select>
            </div>
            <Button onClick={adicionar} disabled={!perfilSelecionado || salvando}>
              <UserPlus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
        )}

        {grupo.perfis.length === 0 ? (
          <p className="rounded-lg bg-zinc-50 p-4 text-sm text-zinc-500 dark:bg-white/5 dark:text-zinc-400">
            Nenhum perfil vinculado a este grupo ainda.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {grupo.perfis.map((vinculo) => (
              <li
                key={vinculo.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 p-3 dark:border-graphite-700/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">{vinculo.perfilNome}</p>
                  {vinculo.dataEntrada && (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">Desde {formatarData(vinculo.dataEntrada)}</p>
                  )}
                </div>
                <Badge variant={podeEntrarNaFila(vinculo.status) ? "success" : "neutral"}>
                  {PERFIL_GRUPO_STATUS_LABEL[vinculo.status]}
                </Badge>
                <Select
                  aria-label={`Situação de ${vinculo.perfilNome} no grupo`}
                  className="h-8 w-auto text-xs"
                  value={vinculo.status}
                  onChange={(e) => mudarStatus(vinculo.perfilId, e.target.value as PerfilGrupoStatusValue)}
                  disabled={salvando}
                >
                  {(Object.keys(PERFIL_GRUPO_STATUS_LABEL) as PerfilGrupoStatusValue[]).map((s) => (
                    <option key={s} value={s}>
                      {PERFIL_GRUPO_STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:bg-red-50"
                  onClick={() => remover(vinculo.perfilId)}
                  disabled={salvando}
                  aria-label={`Remover ${vinculo.perfilNome} do grupo`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}
