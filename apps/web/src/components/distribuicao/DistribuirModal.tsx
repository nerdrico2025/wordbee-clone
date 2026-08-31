"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { podeEntrarNaFila, type GrupoParceiroSummary, type OpcaoCombinacao, type PacoteSummary } from "@/lib/distribution-types";
import type { PerfilOption } from "@/components/distribuicao/GruposClient";

/**
 * Escolhe quais combinações perfil × grupo entram na fila de um dia.
 *
 * Só aparecem combinações válidas: perfil ativo, grupo com parceria ativa e
 * a pessoa já dentro do grupo. Não dá para pedir que alguém poste num grupo
 * de que não participa — e o app não tem, nem deve ter, como fazer alguém
 * entrar num grupo automaticamente.
 */
export function DistribuirModal({
  open,
  onOpenChange,
  pacote,
  perfis,
  grupos,
  hoje,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pacote: PacoteSummary | null;
  perfis: PerfilOption[];
  grupos: GrupoParceiroSummary[];
  hoje: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [dataPrevista, setDataPrevista] = useState(hoje);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const perfisAtivos = useMemo(() => new Set(perfis.filter((p) => p.ativo).map((p) => p.id)), [perfis]);

  const opcoes = useMemo<OpcaoCombinacao[]>(() => {
    const lista: OpcaoCombinacao[] = [];
    for (const grupo of grupos) {
      for (const vinculo of grupo.perfis) {
        if (!podeEntrarNaFila(vinculo.status)) continue;
        if (!perfisAtivos.has(vinculo.perfilId)) continue;
        lista.push({
          perfilId: vinculo.perfilId,
          perfilNome: vinculo.perfilNome,
          grupoId: grupo.id,
          grupoNome: grupo.nome,
        });
      }
    }
    return lista.sort((a, b) => a.perfilNome.localeCompare(b.perfilNome) || a.grupoNome.localeCompare(b.grupoNome));
  }, [grupos, perfisAtivos]);

  const porPerfil = useMemo(() => {
    const mapa = new Map<string, OpcaoCombinacao[]>();
    for (const opcao of opcoes) {
      const atual = mapa.get(opcao.perfilNome) ?? [];
      atual.push(opcao);
      mapa.set(opcao.perfilNome, atual);
    }
    return mapa;
  }, [opcoes]);

  useEffect(() => {
    if (!open) return;
    setSelecionadas(new Set());
    setDataPrevista(hoje);
    setErro(null);
  }, [open, hoje]);

  function alternar(chave: string) {
    setSelecionadas((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }

  function selecionarTodas() {
    setSelecionadas(new Set(opcoes.map((o) => `${o.perfilId}:${o.grupoId}`)));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!pacote) return;
    setSalvando(true);
    setErro(null);
    try {
      const combinacoes = [...selecionadas].map((chave) => {
        const [divulgacaoPerfilId, grupoParceiroId] = chave.split(":");
        return { divulgacaoPerfilId: divulgacaoPerfilId!, grupoParceiroId: grupoParceiroId! };
      });

      const res = await fetch(`/api/distribution-packages/${pacote.id}/fila`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataPrevista, combinacoes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível montar a fila.");

      const ignorados = (data.ignorados ?? []) as Array<{ perfilNome: string; grupoNome: string; motivo: string }>;
      onOpenChange(false);
      toast({
        title: `${data.criados} item(ns) adicionado(s) à fila.`,
        description:
          ignorados.length > 0
            ? `${ignorados.length} combinação(ões) ficou(aram) de fora: ${ignorados[0]!.motivo}`
            : undefined,
        variant: data.criados > 0 ? "success" : "error",
      });
      router.refresh();
    } catch (err) {
      const message = (err as Error).message;
      setErro(message);
      toast({ title: "Não foi possível montar a fila.", description: message, variant: "error" });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Distribuir nos grupos"
      description="Escolha quem posta em qual grupo e em que dia. O Wordbee monta a tarefa — a postagem é feita por você ou pela pessoa, à mão."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="distribuir-form" loading={salvando} disabled={selecionadas.size === 0}>
            Adicionar {selecionadas.size > 0 ? `${selecionadas.size} ` : ""}à fila
          </Button>
        </>
      }
    >
      <form id="distribuir-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Dia previsto"
          type="date"
          value={dataPrevista}
          onChange={(e) => setDataPrevista(e.target.value)}
          hint="O mesmo perfil não pode postar duas vezes no mesmo grupo no mesmo dia."
          required
        />

        {opcoes.length === 0 ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
            Nenhuma combinação disponível. É preciso ter pelo menos um perfil ativo que já esteja dentro de um grupo com
            parceria ativa — cadastre isso em Perfis de Divulgação e Grupos Parceiros.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Onde postar</span>
              <Button type="button" variant="ghost" size="sm" onClick={selecionarTodas}>
                Selecionar todas
              </Button>
            </div>

            {[...porPerfil.entries()].map(([perfilNome, lista]) => (
              <fieldset key={perfilNome} className="rounded-lg border border-zinc-200 p-3 dark:border-graphite-700/60">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  {perfilNome}
                </legend>
                <div className="flex flex-col gap-1.5">
                  {lista.map((opcao) => {
                    const chave = `${opcao.perfilId}:${opcao.grupoId}`;
                    return (
                      <label key={chave} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-zinc-300 text-primary-600 focus:ring-primary-500"
                          checked={selecionadas.has(chave)}
                          onChange={() => alternar(chave)}
                        />
                        {opcao.grupoNome}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        )}

        {erro && (
          <p role="alert" className="text-sm text-red-600">
            {erro}
          </p>
        )}
      </form>
    </Modal>
  );
}
