"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ListChecks, ExternalLink, Check, SkipForward, RotateCcw, MousePointerClick, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { CopyButton } from "@/components/ui/CopyButton";
import { useToast } from "@/components/ui/Toast";
import { FILA_STATUS_LABEL, type FilaItemSummary, type FilaStatusValue } from "@/lib/distribution-types";

export function FilaClient({
  itens,
  perfis,
  grupos,
  hoje,
  dataSelecionada,
  filtros,
}: {
  itens: FilaItemSummary[];
  perfis: { id: string; nome: string }[];
  grupos: { id: string; nome: string }[];
  hoje: string;
  dataSelecionada: string;
  filtros: { perfil?: string; grupo?: string; status?: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [atualizando, setAtualizando] = useState<string | null>(null);

  const porPerfil = useMemo(() => {
    const mapa = new Map<string, FilaItemSummary[]>();
    for (const item of itens) {
      const atual = mapa.get(item.perfil.nome) ?? [];
      atual.push(item);
      mapa.set(item.perfil.nome, atual);
    }
    return mapa;
  }, [itens]);

  const concluidos = itens.filter((i) => i.status !== "PENDENTE").length;

  function atualizarParam(chave: string, valor: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (valor) params.set(chave, valor);
    else params.delete(chave);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  async function mudarStatus(item: FilaItemSummary, status: FilaStatusValue) {
    setAtualizando(item.id);
    try {
      const res = await fetch(`/api/fila-distribuicao/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Não foi possível atualizar o item.");
      toast({ title: status === "POSTADO" ? "Marcado como postado." : FILA_STATUS_LABEL[status], variant: "success" });
      router.refresh();
    } catch (err) {
      toast({ title: "Não foi possível atualizar.", description: (err as Error).message, variant: "error" });
    } finally {
      setAtualizando(null);
    }
  }

  async function remover(item: FilaItemSummary) {
    setAtualizando(item.id);
    try {
      const res = await fetch(`/api/fila-distribuicao/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Não foi possível remover o item.");
      toast({ title: "Item removido da fila.", variant: "success" });
      router.refresh();
    } catch (err) {
      toast({ title: "Não foi possível remover.", description: (err as Error).message, variant: "error" });
    } finally {
      setAtualizando(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Fila de Distribuição"
        subtitle={
          dataSelecionada === hoje
            ? "O que postar hoje, por pessoa. Copie, cole no grupo, marque como feito."
            : `Fila do dia ${formatarData(dataSelecionada)}.`
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          aria-label="Dia da fila"
          type="date"
          value={dataSelecionada}
          onChange={(e) => atualizarParam("data", e.target.value)}
        />
        <Select
          aria-label="Filtrar por perfil"
          value={filtros.perfil ?? ""}
          onChange={(e) => atualizarParam("perfil", e.target.value)}
        >
          <option value="">Todas as pessoas</option>
          {perfis.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filtrar por grupo"
          value={filtros.grupo ?? ""}
          onChange={(e) => atualizarParam("grupo", e.target.value)}
        >
          <option value="">Todos os grupos</option>
          {grupos.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nome}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filtrar por status"
          value={filtros.status ?? ""}
          onChange={(e) => atualizarParam("status", e.target.value)}
        >
          <option value="">Todos os status</option>
          {(Object.keys(FILA_STATUS_LABEL) as FilaStatusValue[]).map((s) => (
            <option key={s} value={s}>
              {FILA_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </div>

      {itens.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={ListChecks}
              title="Nada na fila desse dia"
              description="Monte a fila a partir de um pacote pronto, em Pacotes de Distribuição → Distribuir nos grupos."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
            {concluidos} de {itens.length} concluído(s) neste dia.
          </p>

          <div className="flex flex-col gap-6">
            {[...porPerfil.entries()].map(([perfilNome, lista]) => (
              <section key={perfilNome}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {perfilNome}
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-white/5 dark:text-zinc-400">
                    {lista.filter((i) => i.status === "PENDENTE").length} pendente(s) de {lista.length}
                  </span>
                </h2>
                <div className="flex flex-col gap-3">
                  {lista.map((item) => (
                    <FilaItemCard
                      key={item.id}
                      item={item}
                      ocupado={atualizando === item.id}
                      onStatus={(status) => mudarStatus(item, status)}
                      onRemover={() => remover(item)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FilaItemCard({
  item,
  ocupado,
  onStatus,
  onRemover,
}: {
  item: FilaItemSummary;
  ocupado: boolean;
  onStatus: (status: FilaStatusValue) => void;
  onRemover: () => void;
}) {
  const pendente = item.status === "PENDENTE";

  return (
    <Card className={pendente ? undefined : "opacity-70"}>
      <CardContent>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-zinc-900 dark:text-white">{item.grupo.nome}</h3>
            <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
              {item.pacote.artigoTitulo ?? "Pacote de distribuição"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={item.status === "POSTADO" ? "success" : item.status === "PULADO" ? "neutral" : "warning"}>
              {FILA_STATUS_LABEL[item.status]}
            </Badge>
            <a
              href={item.grupo.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline dark:text-primary-300"
            >
              Abrir grupo <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-3">
          {item.pacote.imagens.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.pacote.imagens.map((url) => (
                <a key={url} href={url} target="_blank" rel="noopener noreferrer" title="Abrir imagem para salvar">
                  {/* Imagem hospedada no WordPress do usuário, fora do domínio do app —
                      ver a nota equivalente em PacotesClient. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    className="h-20 w-20 rounded-lg border border-zinc-200 object-cover dark:border-graphite-700/60"
                  />
                </a>
              ))}
            </div>
          )}

          <div className="min-w-[240px] flex-1 space-y-2">
            <BlocoCopy titulo="1. Texto do post" texto={item.pacote.copyDescricao ?? ""} />
            <BlocoCopy titulo="2. Primeiro comentário (com o link)" texto={item.copyComentario} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 dark:border-graphite-700/60">
          {item.linkRastreado && (
            <span className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
              <MousePointerClick className="h-3.5 w-3.5" />
              {item.cliques} clique(s) neste link
            </span>
          )}
          {item.postadoEm && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              Postado em {new Date(item.postadoEm).toLocaleString("pt-BR")}
            </span>
          )}

          <div className="ml-auto flex flex-wrap gap-2">
            {pendente ? (
              <>
                <Button size="sm" onClick={() => onStatus("POSTADO")} disabled={ocupado}>
                  <Check className="h-3.5 w-3.5" /> Marcar como postado
                </Button>
                <Button variant="secondary" size="sm" onClick={() => onStatus("PULADO")} disabled={ocupado}>
                  <SkipForward className="h-3.5 w-3.5" /> Pular hoje
                </Button>
              </>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => onStatus("PENDENTE")} disabled={ocupado}>
                <RotateCcw className="h-3.5 w-3.5" /> Reabrir
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50"
              onClick={onRemover}
              disabled={ocupado}
              aria-label="Remover item da fila"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BlocoCopy({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-graphite-700/60">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{titulo}</span>
        <CopyButton value={texto} />
      </div>
      <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-200">{texto}</p>
    </div>
  );
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}
