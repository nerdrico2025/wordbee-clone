"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  MAX_IMAGENS_PACOTE_UI,
  MIN_ARTIGOS_DIRETO_SITE,
  type ArtigoDisponivel,
  type PacoteTipoValue,
} from "@/lib/distribution-types";

export function NovoPacoteModal({
  open,
  onOpenChange,
  artigos,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artigos: ArtigoDisponivel[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [articleId, setArticleId] = useState("");
  const [tipo, setTipo] = useState<PacoteTipoValue>("CAPTACAO");
  const [imagensAlvo, setImagensAlvo] = useState(1);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const artigo = useMemo(() => artigos.find((a) => a.id === articleId) ?? null, [artigos, articleId]);

  useEffect(() => {
    if (!open) return;
    setArticleId("");
    setTipo("CAPTACAO");
    setImagensAlvo(1);
    setErro(null);
  }, [open]);

  // Trocar de artigo pode invalidar o tipo escolhido (DIRETO_SITE só faz
  // sentido quando o tema já tem conteúdo). Voltar para CAPTACAO evita
  // deixar o formulário num estado que o servidor vai recusar.
  useEffect(() => {
    if (tipo === "DIRETO_SITE" && artigo && !artigo.diretoSiteRecomendado) setTipo("CAPTACAO");
  }, [artigo, tipo]);

  const jaExiste = artigo?.tiposJaCriados.includes(tipo) ?? false;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/distribution-packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId, tipo, imagensAlvo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível criar o pacote.");
      onOpenChange(false);
      toast({
        title: "Pacote criado.",
        description: "O worker vai montar o texto e as imagens nos próximos minutos.",
        variant: "success",
      });
      router.refresh();
    } catch (err) {
      const message = (err as Error).message;
      setErro(message);
      toast({ title: "Não foi possível criar o pacote.", description: message, variant: "error" });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Novo pacote de distribuição"
      description="Monte um pacote a partir de um artigo já publicado."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="novo-pacote-form" loading={salvando} disabled={!articleId || jaExiste}>
            Criar pacote
          </Button>
        </>
      }
    >
      <form id="novo-pacote-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Select label="Artigo" value={articleId} onChange={(e) => setArticleId(e.target.value)} required>
          <option value="">Selecione um artigo publicado...</option>
          {artigos.map((a) => (
            <option key={a.id} value={a.id}>
              {a.titulo} — {a.siteNome}
            </option>
          ))}
        </Select>

        <Select
          label="Tipo do pacote"
          hint={
            artigo
              ? artigo.diretoSiteRecomendado
                ? `Este tema já tem ${artigo.artigosNoTema} artigos publicados — mandar para a busca do blog faz sentido.`
                : `Este tema tem só ${artigo.artigosNoTema} artigo(s). "Direto pro site" precisa de pelo menos ${MIN_ARTIGOS_DIRETO_SITE} para valer a pena.`
              : "Captação leva ao artigo; direto pro site leva à busca do blog pelo tema."
          }
          value={tipo}
          onChange={(e) => setTipo(e.target.value as PacoteTipoValue)}
        >
          <option value="CAPTACAO">Captação — o comentário leva ao artigo</option>
          <option value="DIRETO_SITE" disabled={!artigo?.diretoSiteRecomendado}>
            Direto pro site — o comentário leva à busca do blog
            {artigo && !artigo.diretoSiteRecomendado ? " (tema ainda sem conteúdo suficiente)" : ""}
          </option>
        </Select>

        <Select
          label="Imagens do pacote"
          hint="1 reaproveita a imagem do artigo, sem custo de IA. Mais de uma gera um álbum de fotos novas do mesmo tema."
          value={String(imagensAlvo)}
          onChange={(e) => setImagensAlvo(Number(e.target.value))}
        >
          {Array.from({ length: MAX_IMAGENS_PACOTE_UI }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n === 1 ? "1 imagem (a do artigo)" : `${n} imagens (álbum gerado por IA)`}
            </option>
          ))}
        </Select>

        {jaExiste && (
          <p className="text-sm text-amber-600">
            Este artigo já tem um pacote desse tipo. Escolha o outro tipo ou use o pacote que já existe.
          </p>
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
