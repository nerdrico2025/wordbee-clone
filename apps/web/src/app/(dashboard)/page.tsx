import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Globe, TrendingUp, PenSquare, KeyRound, History, ExternalLink } from "lucide-react";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { ARTICLE_TYPE_OPTIONS } from "@/lib/article-type-options";

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

const TYPE_LABELS = Object.fromEntries(ARTICLE_TYPE_OPTIONS.map((t) => [t.value, t.label]));

export default async function DashboardPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const userId = session.user.id;
  const inicioMes = startOfMonth();
  const em24h = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const [totalPublicados, publicadosMes, sitesCount, agendados24h, linhasAtivas, apiKeysCount, ultimosArtigos] = await Promise.all([
    prisma.article.count({ where: { userId, status: "PUBLICADO" } }),
    prisma.article.count({ where: { userId, status: "PUBLICADO", publishedAt: { gte: inicioMes } } }),
    prisma.wpSite.count({ where: { userId } }),
    prisma.titleQueueItem.count({ where: { line: { userId }, status: "NA_FILA", previstoPara: { lte: em24h } } }),
    prisma.productionLine.count({ where: { userId, status: "ATIVA" } }),
    prisma.apiKey.count({ where: { userId } }),
    prisma.article.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { wpSite: { select: { nome: true } } },
    }),
  ]);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Visão geral da sua produção de conteúdo." />

      <div className="rounded-card bg-brand-gradient p-6 text-white shadow-card">
        <p className="text-sm font-medium text-white/80">Resumo do mês</p>
        <div className="mt-3 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div>
            <p className="text-3xl font-bold">{publicadosMes}</p>
            <p className="text-sm text-white/80">Artigos publicados</p>
          </div>
          <div>
            <p className="text-3xl font-bold">{agendados24h}</p>
            <p className="text-sm text-white/80">Agendados nas próximas 24h</p>
          </div>
          <div>
            <p className="text-3xl font-bold">{linhasAtivas}</p>
            <p className="text-sm text-white/80">Linhas ativas</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard icon={FileText} label="Total publicados" value={totalPublicados} />
        <MetricCard icon={TrendingUp} label="Publicados este mês" value={publicadosMes} />
        <MetricCard icon={Globe} label="Sites cadastrados" value={sitesCount} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Ações rápidas</h2>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href="/criar-artigo"
                className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
              >
                <PenSquare className="h-4 w-4" /> Gerar artigo agora
              </Link>
              <Link
                href="/sites-wordpress"
                className="flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-graphite-700/60 dark:text-zinc-200 dark:hover:bg-white/5"
              >
                <Globe className="h-4 w-4" /> Gerenciar sites WordPress
              </Link>
              <Link
                href="/chaves-de-api"
                className="flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-graphite-700/60 dark:text-zinc-200 dark:hover:bg-white/5"
              >
                <KeyRound className="h-4 w-4" /> {apiKeysCount > 0 ? "IAs configuradas" : "Configurar IAs"}
              </Link>
              <Link
                href="/historico"
                className="flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-graphite-700/60 dark:text-zinc-200 dark:hover:bg-white/5"
              >
                <History className="h-4 w-4" /> Ver histórico
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Últimos artigos</h2>
            {ultimosArtigos.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Você ainda não publicou nenhum artigo."
                description="Gere seu primeiro artigo para vê-lo aqui."
              />
            ) : (
              <ul className="mt-3 flex flex-col divide-y divide-zinc-100 dark:divide-graphite-700/60">
                {ultimosArtigos.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">{a.titulo}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant="neutral">{TYPE_LABELS[a.tipo] ?? a.tipo}</Badge>
                        <span className="text-xs text-zinc-400">{a.wpSite.nome}</span>
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
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-100 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-white">{value}</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
