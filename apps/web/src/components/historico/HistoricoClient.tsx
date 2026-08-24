"use client";

import { Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ExternalLink, History } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { HistoricoFilters } from "@/components/historico/HistoricoFilters";
import { ResendButton } from "@/components/historico/ResendButton";
import { ARTICLE_TYPE_OPTIONS } from "@/lib/article-type-options";
import type { HistoricoArticle, HistoricoFiltersValue } from "@/lib/historico-types";

const TYPE_LABELS = Object.fromEntries(ARTICLE_TYPE_OPTIONS.map((t) => [t.value, t.label]));

const STATUS_BADGE: Record<string, "success" | "neutral" | "danger" | "warning"> = {
  PUBLICADO: "success",
  RASCUNHO: "neutral",
  FALHA: "danger",
  PROCESSANDO: "warning",
};

const STATUS_LABEL: Record<string, string> = {
  PUBLICADO: "Publicado",
  RASCUNHO: "Rascunho",
  FALHA: "Falha",
  PROCESSANDO: "Processando",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

interface Props {
  articles: HistoricoArticle[];
  total: number;
  page: number;
  pageSize: number;
  sites: { id: string; nome: string }[];
  lines: { id: string; nome: string }[];
  filters: HistoricoFiltersValue;
}

export function HistoricoClient({ articles, total, page, pageSize, sites, lines }: Props) {
  return (
    <div>
      <PageHeader title="Histórico" subtitle="Todos os artigos gerados, manuais ou por linhas de produção." />
      <Suspense>
        <HistoricoFilters sites={sites} lines={lines} />
      </Suspense>

      {articles.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={History} title="Nenhum artigo no histórico" description="Os artigos gerados manualmente ou por linhas de produção vão aparecer aqui." />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs uppercase text-zinc-400 dark:border-graphite-700/60">
                  <th className="px-4 py-3 font-medium">Título</th>
                  <th className="px-4 py-3 font-medium">Site</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Origem</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((a) => (
                  <ArticleRow key={a.id} article={a} />
                ))}
              </tbody>
            </table>
          </div>
          <Suspense>
            <Pagination page={page} pageSize={pageSize} total={total} />
          </Suspense>
        </Card>
      )}
    </div>
  );
}

function ArticleRow({ article }: { article: HistoricoArticle }) {
  const router = useRouter();
  return (
    <tr className="border-b border-zinc-50 last:border-0 dark:border-graphite-700/40">
      <td className="max-w-xs truncate px-4 py-3 font-medium text-zinc-900 dark:text-white">
        {article.titulo}
        {article.erroMsg && <p className="mt-0.5 truncate text-xs font-normal text-red-500">{article.erroMsg}</p>}
      </td>
      <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">{article.siteNome}</td>
      <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">{TYPE_LABELS[article.tipo] ?? article.tipo}</td>
      <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">{article.origem === "MANUAL" ? "Manual" : article.lineNome}</td>
      <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">{formatDateTime(article.createdAt)}</td>
      <td className="px-4 py-3">
        <Badge variant={STATUS_BADGE[article.status] ?? "neutral"}>{STATUS_LABEL[article.status] ?? article.status}</Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {article.wpUrl && (
            <a href={article.wpUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
              Ver no blog <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {article.status === "FALHA" && <ResendButton articleId={article.id} onResent={() => router.refresh()} />}
        </div>
      </td>
    </tr>
  );
}

function Pagination({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function goTo(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(nextPage));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 text-sm text-zinc-500 dark:border-graphite-700/60">
      <span>
        Página {page} de {totalPages} ({total} artigo{total === 1 ? "" : "s"})
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => goTo(page - 1)}>
          Anterior
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => goTo(page + 1)}>
          Próxima
        </Button>
      </div>
    </div>
  );
}
