"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Clock, AlertTriangle, Trash2, Send, MousePointerClick } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CopyButton } from "@/components/ui/CopyButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { NovoPacoteModal } from "@/components/distribuicao/NovoPacoteModal";
import { DistribuirModal } from "@/components/distribuicao/DistribuirModal";
import type { ArtigoDisponivel, GrupoParceiroSummary, PacoteSummary } from "@/lib/distribution-types";
import type { PerfilOption } from "@/components/distribuicao/GruposClient";

export function PacotesClient({
  pacotes,
  artigos,
  perfis,
  grupos,
  hoje,
}: {
  pacotes: PacoteSummary[];
  artigos: ArtigoDisponivel[];
  perfis: PerfilOption[];
  grupos: GrupoParceiroSummary[];
  hoje: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [novoOpen, setNovoOpen] = useState(false);
  const [distribuindo, setDistribuindo] = useState<PacoteSummary | null>(null);
  const [excluindo, setExcluindo] = useState<PacoteSummary | null>(null);
  const [removendo, setRemovendo] = useState(false);

  async function trocarVariacao(pacote: PacoteSummary, indice: number) {
    try {
      const res = await fetch(`/api/distribution-packages/${pacote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variacaoIndice: indice }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Não foi possível trocar a variação.");
      toast({ title: `Variação ${indice + 1} aplicada.`, variant: "success" });
      router.refresh();
    } catch (err) {
      toast({ title: "Não foi possível trocar a variação.", description: (err as Error).message, variant: "error" });
    }
  }

  async function excluir() {
    if (!excluindo) return;
    setRemovendo(true);
    try {
      const res = await fetch(`/api/distribution-packages/${excluindo.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Não foi possível excluir o pacote.");
      toast({ title: "Pacote excluído.", variant: "success" });
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
        title="Pacotes de Distribuição"
        subtitle="Imagem, texto do post e texto do comentário prontos para publicar — nas Páginas automaticamente e nos grupos com um clique seu."
        action={<Button onClick={() => setNovoOpen(true)}>+ Novo pacote</Button>}
      />

      {pacotes.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Package}
              title="Nenhum pacote ainda"
              description="Pacotes são criados automaticamente para cada artigo publicado — ou monte um agora a partir de um artigo já no ar."
              action={<Button onClick={() => setNovoOpen(true)}>Criar pacote</Button>}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {pacotes.map((pacote) => (
            <PacoteCard
              key={pacote.id}
              pacote={pacote}
              onDistribuir={() => setDistribuindo(pacote)}
              onExcluir={() => setExcluindo(pacote)}
              onTrocarVariacao={(indice) => trocarVariacao(pacote, indice)}
            />
          ))}
        </div>
      )}

      <NovoPacoteModal open={novoOpen} onOpenChange={setNovoOpen} artigos={artigos} />

      <DistribuirModal
        open={!!distribuindo}
        onOpenChange={(open) => !open && setDistribuindo(null)}
        pacote={distribuindo}
        perfis={perfis}
        grupos={grupos}
        hoje={hoje}
      />

      <ConfirmDialog
        open={!!excluindo}
        onOpenChange={(open) => !open && setExcluindo(null)}
        title="Excluir pacote de distribuição"
        description="Isso apaga os itens da fila e os links rastreados deste pacote (junto com a contagem de cliques). Os posts já publicados continuam no Facebook."
        confirmLabel="Excluir"
        loading={removendo}
        onConfirm={excluir}
      />
    </div>
  );
}

function PacoteCard({
  pacote,
  onDistribuir,
  onExcluir,
  onTrocarVariacao,
}: {
  pacote: PacoteSummary;
  onDistribuir: () => void;
  onExcluir: () => void;
  onTrocarVariacao: (indice: number) => void;
}) {
  const pronto = pacote.status === "PRONTO";

  return (
    <Card>
      <CardContent>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
              {pacote.artigo?.titulo ?? "Pacote sem artigo"}
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {pacote.artigo?.siteNome}
              {pacote.artigo?.tema ? ` · ${pacote.artigo.tema}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={pacote.tipo === "CAPTACAO" ? "purple" : "neutral"}>
              {pacote.tipo === "CAPTACAO" ? "Captação" : "Direto pro site"}
            </Badge>
            <Badge variant={pronto ? "success" : pacote.status === "FALHA" ? "danger" : "warning"}>
              {pronto ? "Pronto" : pacote.status === "FALHA" ? "Falhou" : "Montando..."}
            </Badge>
          </div>
        </div>

        {pacote.status === "PENDENTE" && (
          <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            O worker está montando este pacote (texto e imagens). Costuma levar alguns minutos — atualize a página depois.
          </p>
        )}

        {pacote.status === "FALHA" && pacote.erroMsg && (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {pacote.erroMsg}
          </p>
        )}

        {pronto && (
          <>
            {pacote.imagens.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {pacote.imagens.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer" title="Abrir imagem em tamanho real">
                    {/* Imagem hospedada no WordPress do usuário, fora do domínio do app;
                        next/image exigiria configurar remotePatterns por site cadastrado
                        (que são ilimitados). Mesmo caminho já usado em ReferenceImagesSection. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt=""
                      className="h-24 w-24 rounded-lg border border-zinc-200 object-cover dark:border-graphite-700/60"
                    />
                  </a>
                ))}
              </div>
            )}

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <BlocoCopy titulo="Texto do post" texto={pacote.copyDescricao ?? ""} />
              <BlocoCopy titulo="Comentário (com o link)" texto={pacote.copyComentario ?? ""} />
            </div>

            {pacote.variacoes.length > 1 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Outras versões do texto:</span>
                {pacote.variacoes.map((variacao, indice) => (
                  <Button
                    key={indice}
                    variant="secondary"
                    size="sm"
                    onClick={() => onTrocarVariacao(indice)}
                    disabled={variacao.copyDescricao === pacote.copyDescricao}
                    title={variacao.copyDescricao}
                  >
                    {variacao.copyDescricao === pacote.copyDescricao ? `✓ Versão ${indice + 1}` : `Usar versão ${indice + 1}`}
                  </Button>
                ))}
              </div>
            )}
          </>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-graphite-700/60 dark:text-zinc-400">
          <span>{pacote.paginasCount} publicação(ões) em Página</span>
          <span>·</span>
          <span>{pacote.filaCount} na fila manual</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <MousePointerClick className="h-3.5 w-3.5" />
            {pacote.cliquesTotais} clique(s)
          </span>

          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={onDistribuir} disabled={!pronto}>
              <Send className="h-3.5 w-3.5" /> Distribuir nos grupos
            </Button>
            <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={onExcluir}>
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
