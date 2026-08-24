"use client";

import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { ARTICLE_TYPE_OPTIONS, type ArticleTypeValue } from "@/lib/article-type-options";
import { INTERVAL_OPTIONS } from "@/lib/interval-options";
import type { CategoryOption, ProviderOption, SiteOption } from "@/lib/criar-artigo-types";
import type { ProductionLineSummary } from "@/lib/production-line-types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sites: SiteOption[];
  textProviders: ProviderOption[];
  imageProviders: ProviderOption[];
  onCreated: (line: ProductionLineSummary) => void;
}

export function NewLineModal({ open, onOpenChange, sites, textProviders, imageProviders, onCreated }: Props) {
  const [nome, setNome] = useState("");
  const [wpSiteId, setWpSiteId] = useState(sites[0]?.id ?? "");
  const [categorias, setCategorias] = useState<CategoryOption[] | null>(null);
  const [categoriasLoading, setCategoriasLoading] = useState(false);
  const [categoriaWpId, setCategoriaWpId] = useState("");
  const [iaTexto, setIaTexto] = useState(textProviders[0]?.provider ?? "OPENAI");
  const [iaImagem, setIaImagem] = useState(imageProviders[0]?.provider ?? "OPENAI");
  const [tipoArtigo, setTipoArtigo] = useState<ArticleTypeValue>("TUTORIAL");
  const [temasRaw, setTemasRaw] = useState("");
  const [intervaloMin, setIntervaloMin] = useState(60);
  const [maxArtigos, setMaxArtigos] = useState("");
  const [statusWp, setStatusWp] = useState<"PUBLISH" | "DRAFT">("PUBLISH");
  const [promptCustomizado, setPromptCustomizado] = useState("");
  const [rateLimitBehavior, setRateLimitBehavior] = useState<"ADIAR" | "PAUSAR">("ADIAR");
  const [stagedImages, setStagedImages] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome("");
    setWpSiteId(sites[0]?.id ?? "");
    setCategoriaWpId("");
    setIaTexto(textProviders[0]?.provider ?? "OPENAI");
    setIaImagem(imageProviders[0]?.provider ?? "OPENAI");
    setTipoArtigo("TUTORIAL");
    setTemasRaw("");
    setIntervaloMin(60);
    setMaxArtigos("");
    setStatusWp("PUBLISH");
    setPromptCustomizado("");
    setRateLimitBehavior("ADIAR");
    setStagedImages([]);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!wpSiteId) return;
    setCategorias(null);
    setCategoriaWpId("");
    setCategoriasLoading(true);
    fetch(`/api/wp-sites/${wpSiteId}/categories`)
      .then((res) => res.json())
      .then((data) => setCategorias(data.categories ?? []))
      .catch(() => setCategorias([]))
      .finally(() => setCategoriasLoading(false));
  }, [wpSiteId]);

  function handleFilesSelected(files: FileList | null) {
    if (!files) return;
    const remaining = 5 - stagedImages.length;
    setStagedImages((prev) => [...prev, ...Array.from(files).slice(0, remaining)]);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const temas = temasRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (temas.length === 0) {
      setError("Informe ao menos um tema.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/production-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          wpSiteId,
          categoriaWpId: categoriaWpId ? Number(categoriaWpId) : undefined,
          categoriaWpNome: categorias?.find((c) => String(c.id) === categoriaWpId)?.name,
          iaTexto,
          iaImagem,
          tipoArtigo,
          temas,
          intervaloMin,
          maxArtigos: maxArtigos ? Number(maxArtigos) : undefined,
          statusWp,
          promptCustomizado: promptCustomizado.trim() || undefined,
          rateLimitBehavior,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível criar a linha.");

      if (stagedImages.length > 0) {
        setUploadingImages(true);
        for (const file of stagedImages) {
          const form = new FormData();
          form.append("file", file);
          await fetch(`/api/production-lines/${data.line.id}/reference-images`, { method: "POST", body: form }).catch(() => undefined);
        }
        setUploadingImages(false);
      }

      onCreated(data.line);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Nova Linha de Produção"
      className="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="new-line-form" loading={loading || uploadingImages}>
            Criar Linha de Produção
          </Button>
        </>
      }
    >
      <form id="new-line-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input label="Nome da linha *" placeholder="Ex: Blog de Receitas, Artigos Tech..." value={nome} onChange={(e) => setNome(e.target.value)} required />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Site WordPress *" value={wpSiteId} onChange={(e) => setWpSiteId(e.target.value)} required>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </Select>
          <Select label="Categoria (opc.)" value={categoriaWpId} onChange={(e) => setCategoriaWpId(e.target.value)} disabled={categoriasLoading}>
            <option value="">{categoriasLoading ? "Carregando…" : "Sem categoria"}</option>
            {categorias?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          <Select label="IA para Texto *" value={iaTexto} onChange={(e) => setIaTexto(e.target.value as typeof iaTexto)} required>
            {textProviders.map((p) => (
              <option key={p.provider} value={p.provider}>
                {p.nome} ({p.modeloLabel})
              </option>
            ))}
          </Select>
          <Select label="IA para Imagem *" value={iaImagem} onChange={(e) => setIaImagem(e.target.value as typeof iaImagem)} required>
            {imageProviders.map((p) => (
              <option key={p.provider} value={p.provider}>
                {p.nome} ({p.modeloLabel})
              </option>
            ))}
          </Select>
        </div>

        <Select label="Tipo de artigo *" value={tipoArtigo} onChange={(e) => setTipoArtigo(e.target.value as ArticleTypeValue)} required>
          {ARTICLE_TYPE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>

        <Input
          label="Tema / Nicho *"
          placeholder="Ex: Receitas fit, Marketing digital..."
          hint="A IA vai criar artigos variados dentro deste tema. Separe múltiplos temas por vírgula."
          value={temasRaw}
          onChange={(e) => setTemasRaw(e.target.value)}
          required
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Intervalo *" value={intervaloMin} onChange={(e) => setIntervaloMin(Number(e.target.value))} required>
            {INTERVAL_OPTIONS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </Select>
          <Input
            label="Máximo de artigos"
            type="number"
            min={1}
            placeholder="Ilimitado"
            hint="Deixe vazio para ilimitado"
            value={maxArtigos}
            onChange={(e) => setMaxArtigos(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Status no WordPress"
            hint="Artigos serão publicados automaticamente"
            value={statusWp}
            onChange={(e) => setStatusWp(e.target.value as "PUBLISH" | "DRAFT")}
          >
            <option value="PUBLISH">Publicado</option>
            <option value="DRAFT">Rascunho</option>
          </Select>
          <Select
            label="Se atingir limite de uso da IA"
            hint="O que fazer quando o provedor de IA atingir o limite"
            value={rateLimitBehavior}
            onChange={(e) => setRateLimitBehavior(e.target.value as "ADIAR" | "PAUSAR")}
          >
            <option value="ADIAR">Adiar próximo disparo</option>
            <option value="PAUSAR">Pausar linha</option>
          </Select>
        </div>

        <Textarea
          label="Prompt customizado (opcional)"
          placeholder="Instruções adicionais para a IA"
          value={promptCustomizado}
          onChange={(e) => setPromptCustomizado(e.target.value)}
        />

        <div>
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Imagens de Referência (opcional)</label>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            A IA usará como inspiração visual ao gerar as imagens dos artigos. Funciona melhor com Gemini como provedor de imagem.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {stagedImages.map((file, index) => (
              <div key={`${file.name}-${index}`} className="relative h-16 w-16 overflow-hidden rounded-lg border border-zinc-200 dark:border-graphite-700/60">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={URL.createObjectURL(file)} alt={file.name} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setStagedImages((prev) => prev.filter((_, i) => i !== index))}
                  className="absolute right-0 top-0 rounded-bl bg-black/60 p-0.5 text-white"
                  aria-label="Remover imagem"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {stagedImages.length < 5 && (
              <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border border-dashed border-zinc-300 text-xs text-zinc-400 hover:border-primary-400 hover:text-primary-500 dark:border-graphite-700/60">
                + Foto
                <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => handleFilesSelected(e.target.files)} />
              </label>
            )}
          </div>
          {uploadingImages && <p className="mt-1 text-xs text-zinc-500">Enviando imagens...</p>}
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
