import { CheckCircle2, ExternalLink } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import type { LineArticleSummary } from "@/lib/production-line-types";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function PublishedArticlesSection({ articles }: { articles: LineArticleSummary[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Artigos Publicados ({articles.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {articles.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">Nenhum artigo publicado ainda.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-graphite-700/60">
            {articles.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">{a.titulo}</p>
                    <p className="text-xs text-zinc-400">Publicado em {formatDateTime(a.publishedAt)}</p>
                  </div>
                </div>
                {a.wpUrl && (
                  <a
                    href={a.wpUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
                  >
                    Ver no blog <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
