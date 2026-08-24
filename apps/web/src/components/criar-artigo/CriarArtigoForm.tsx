"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ExternalLink, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { ProgressSteps, type StepState } from "@/components/criar-artigo/ProgressSteps";
import { ARTICLE_TYPE_OPTIONS, type ArticleTypeValue } from "@/lib/article-type-options";
import type { CategoryOption, ProviderOption, ProviderValue, SiteOption } from "@/lib/criar-artigo-types";

interface Props {
  sites: SiteOption[];
  textProviders: ProviderOption[];
  imageProviders: ProviderOption[];
}

type PipelineEvent = { step: string; status: "start" | "done" | "error"; [key: string]: unknown };

export function CriarArtigoForm({ sites, textProviders, imageProviders }: Props) {
  const [wpSiteId, setWpSiteId] = useState(sites[0]?.id ?? "");
  const [categorias, setCategorias] = useState<CategoryOption[] | null>(null);
  const [categoriasLoading, setCategoriasLoading] = useState(false);
  const [categoriaWpId, setCategoriaWpId] = useState<string>("");

  const [iaTexto, setIaTexto] = useState<ProviderValue>(textProviders[0]?.provider ?? "OPENAI");
  const [iaImagem, setIaImagem] = useState<ProviderValue>(imageProviders[0]?.provider ?? "OPENAI");
  const [tipo, setTipo] = useState<ArticleTypeValue>("TUTORIAL");
  const [tema, setTema] = useState("");
  const [titulo, setTitulo] = useState("");
  const [promptCustomizado, setPromptCustomizado] = useState("");
  const [statusWp, setStatusWp] = useState<"PUBLISH" | "DRAFT">("PUBLISH");

  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [titlesLoading, setTitlesLoading] = useState(false);
  const [titlesError, setTitlesError] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<Record<string, StepState>>({});
  const [resultLink, setResultLink] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  async function handleGenerateTitles() {
    if (!tema.trim()) return;
    setTitlesLoading(true);
    setTitlesError(null);
    try {
      const res = await fetch("/api/ai/titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, tema, iaTexto, titulosExistentes: titleSuggestions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível gerar títulos.");
      setTitleSuggestions(data.titulos ?? []);
    } catch (err) {
      setTitlesError((err as Error).message);
    } finally {
      setTitlesLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setGenerating(true);
    setErrorMessage(null);
    setResultLink(null);
    setProgress({});

    try {
      const res = await fetch("/api/articles/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wpSiteId,
          categoriaWpId: categoriaWpId ? Number(categoriaWpId) : undefined,
          iaTexto,
          iaImagem,
          tipo,
          tema,
          titulo: titulo.trim() || undefined,
          promptCustomizado: promptCustomizado.trim() || undefined,
          statusWp,
        }),
      });

      if (!res.body) throw new Error("Resposta sem streaming do servidor.");
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Não foi possível iniciar a geração.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event: PipelineEvent = JSON.parse(line);
          applyEvent(event);
        }
      }
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  function applyEvent(event: PipelineEvent) {
    if (event.status === "start") {
      setProgress((prev) => ({ ...prev, [event.step]: "active" }));
    } else if (event.status === "done") {
      setProgress((prev) => ({ ...prev, [event.step]: "done" }));
      if (event.step === "titulo" && typeof event.titulo === "string") setTitulo(event.titulo);
      if (event.step === "publicando" && typeof event.wpUrl === "string") setResultLink(event.wpUrl);
    } else if (event.status === "error") {
      setProgress((prev) => ({ ...prev, [event.step]: "error" }));
      setErrorMessage(typeof event.message === "string" ? event.message : "Erro ao gerar o artigo.");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Site WordPress" value={wpSiteId} onChange={(e) => setWpSiteId(e.target.value)} required>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </Select>

              <Select
                label="Categoria (opcional)"
                value={categoriaWpId}
                onChange={(e) => setCategoriaWpId(e.target.value)}
                disabled={categoriasLoading}
              >
                <option value="">{categoriasLoading ? "Carregando…" : "Sem categoria"}</option>
                {categorias?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>

              <Select label="IA para Texto" value={iaTexto} onChange={(e) => setIaTexto(e.target.value as ProviderValue)} required>
                {textProviders.map((p) => (
                  <option key={p.provider} value={p.provider}>
                    {p.nome} ({p.modeloLabel})
                  </option>
                ))}
              </Select>

              <Select label="IA para Imagem" value={iaImagem} onChange={(e) => setIaImagem(e.target.value as ProviderValue)} required>
                {imageProviders.map((p) => (
                  <option key={p.provider} value={p.provider}>
                    {p.nome} ({p.modeloLabel})
                  </option>
                ))}
              </Select>

              <Select
                label="Tipo de artigo"
                className="sm:col-span-2"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as ArticleTypeValue)}
                required
              >
                {ARTICLE_TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>

            <Input label="Tema" placeholder="Ex: Receitas fit" value={tema} onChange={(e) => setTema(e.target.value)} required />

            <div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input label="Título" placeholder="Deixe em branco para a IA gerar" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
                </div>
                <Button type="button" variant="secondary" onClick={handleGenerateTitles} loading={titlesLoading} disabled={!tema.trim()}>
                  <Sparkles className="h-4 w-4" /> Gerar títulos com IA
                </Button>
              </div>
              {titlesError && <p className="mt-1 text-xs text-red-600">{titlesError}</p>}
              {titleSuggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {titleSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setTitulo(s)}
                      className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs text-primary-700 hover:bg-primary-100 dark:border-primary-800 dark:bg-primary-500/10 dark:text-primary-300"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Textarea
              label="Prompt customizado (opcional)"
              placeholder="Instruções adicionais para a IA"
              value={promptCustomizado}
              onChange={(e) => setPromptCustomizado(e.target.value)}
            />

            <Select label="Status no WordPress" value={statusWp} onChange={(e) => setStatusWp(e.target.value as "PUBLISH" | "DRAFT")}>
              <option value="PUBLISH">Publicado</option>
              <option value="DRAFT">Rascunho</option>
            </Select>

            <Button type="submit" size="lg" loading={generating} className="mt-2">
              Gerar Artigo
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardContent>
          <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-white">Progresso</h3>
          {Object.keys(progress).length === 0 && !generating ? (
            <p className="text-sm text-zinc-500">Preencha o formulário e clique em &quot;Gerar Artigo&quot;.</p>
          ) : (
            <ProgressSteps progress={progress} />
          )}

          {errorMessage && (
            <p role="alert" className="mt-4 text-sm text-red-600">
              {errorMessage}
            </p>
          )}

          {resultLink && (
            <a
              href={resultLink}
              target="_blank"
              rel="noreferrer"
              className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:underline"
            >
              Ver no blog <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
