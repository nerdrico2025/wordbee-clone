import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Facebook,
  ListChecks,
  MousePointerClick,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Package,
  Info,
} from "lucide-react";
import { getCurrentSession } from "@/lib/auth";
import { carregarMetricasDistribuicao, JANELA_DIAS, type ResumoCliques } from "@/lib/distribution-metrics";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function PainelDeDistribuicaoPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const m = await carregarMetricasDistribuicao(session.user.id);

  return (
    <div>
      <PageHeader
        title="Painel de Distribuição"
        subtitle={`Como os artigos estão chegando às pessoas — números dos últimos ${JANELA_DIAS} dias.`}
      />

      <div className="rounded-card bg-brand-gradient p-6 text-white shadow-card">
        <p className="text-sm font-medium text-white/80">Últimos {JANELA_DIAS} dias</p>
        <div className="mt-3 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div>
            <p className="text-3xl font-bold">{m.totalPublicadoPaginas}</p>
            <p className="text-sm text-white/80">Publicações em Páginas</p>
          </div>
          <div>
            <p className="text-3xl font-bold">{m.projecao.realizadasPorDia}</p>
            <p className="text-sm text-white/80">Postagens manuais por dia (média)</p>
          </div>
          <div>
            <p className="text-3xl font-bold">{m.cliquesTotais}</p>
            <p className="text-sm text-white/80">Cliques nos links rastreados</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardContent>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
              <ListChecks className="h-4 w-4" /> Fila de hoje
            </h2>
            {m.filaHoje.total === 0 ? (
              <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                Nada na fila hoje.{" "}
                <Link href="/pacotes-de-distribuicao" className="text-primary-600 hover:underline dark:text-primary-300">
                  Distribuir um pacote
                </Link>
                .
              </p>
            ) : (
              <>
                <p className="mt-3 text-2xl font-bold text-zinc-900 dark:text-white">
                  {m.filaHoje.postados}
                  <span className="text-base font-medium text-zinc-400"> / {m.filaHoje.total}</span>
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">concluídas</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <Badge variant="warning">{m.filaHoje.pendentes} pendente(s)</Badge>
                  {m.filaHoje.pulados > 0 && <Badge variant="neutral">{m.filaHoje.pulados} pulada(s)</Badge>}
                </div>
                <Link
                  href="/fila-de-distribuicao"
                  className="mt-3 inline-block text-sm text-primary-600 hover:underline dark:text-primary-300"
                >
                  Abrir a fila →
                </Link>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
              <Package className="h-4 w-4" /> Pacotes
            </h2>
            <p className="mt-3 text-2xl font-bold text-zinc-900 dark:text-white">{m.pacotesProntos}</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">prontos nos últimos {JANELA_DIAS} dias</p>
            {m.pacotesPendentes > 0 && (
              <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                {m.pacotesPendentes} sendo montado(s) pelo worker agora.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
              <Facebook className="h-4 w-4" /> Páginas do Facebook
            </h2>
            <p className="mt-3 text-2xl font-bold text-zinc-900 dark:text-white">{m.totalPublicadoPaginas}</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">publicações automáticas</p>
            {m.totalFalhasPaginas > 0 && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-red-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                {m.totalFalhasPaginas} falha(s) no período
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardContent>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Publicações por Página</h2>
          {m.paginas.length === 0 ? (
            <EmptyState
              icon={Facebook}
              title="Nenhuma publicação automática no período"
              description="Cadastre uma Página do Facebook e publique um artigo para o Wordbee distribuir automaticamente."
            />
          ) : (
            <ul className="mt-3 divide-y divide-zinc-100 dark:divide-graphite-700/60">
              {m.paginas.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">{p.nome}</p>
                    {!p.statusValidacao && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-red-600">
                        <AlertTriangle className="h-3 w-3" />
                        Token inválido — esta Página parou de receber publicações.
                      </p>
                    )}
                    {p.ultimoErro && <p className="mt-0.5 truncate text-xs text-zinc-400">{p.ultimoErro}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Badge variant="success">
                      <CheckCircle2 className="h-3 w-3" /> {p.publicados}
                    </Badge>
                    {p.falhas > 0 && (
                      <Badge variant="danger">
                        <AlertTriangle className="h-3 w-3" /> {p.falhas}
                      </Badge>
                    )}
                    {p.aguardando > 0 && <Badge variant="warning">{p.aguardando} agendada(s)</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListaCliques
          titulo="Cliques por grupo parceiro"
          descricao="Qual parceria realmente traz gente — o número que decide se vale renovar."
          itens={m.cliquesPorGrupo}
        />
        <ListaCliques
          titulo="Cliques por perfil"
          descricao="Quanto cada pessoa está trazendo de tráfego."
          itens={m.cliquesPorPerfil}
        />
      </div>

      <Card className="mt-6">
        <CardContent>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
            <TrendingUp className="h-4 w-4" /> Capacidade da estrutura atual
          </h2>

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-zinc-600 dark:text-zinc-300">
            <Fator valor={m.projecao.pacotesPorDia} rotulo="pacotes/dia" />
            <span className="text-zinc-400">×</span>
            <Fator valor={m.projecao.perfisAtivos} rotulo="perfis ativos" />
            <span className="text-zinc-400">×</span>
            <Fator valor={m.projecao.gruposPorPerfil} rotulo="grupos por perfil" />
            <span className="text-zinc-400">=</span>
            <Fator valor={m.projecao.possiveisPorDia} rotulo="distribuições/dia possíveis" destaque />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4 dark:border-graphite-700/60">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Realizado: <strong className="text-zinc-900 dark:text-white">{m.projecao.realizadasPorDia}</strong> postagem(ns)
              manual(is) por dia, em média.
            </p>
            {m.projecao.aproveitamento !== null && (
              <Badge variant={m.projecao.aproveitamento >= 0.7 ? "success" : m.projecao.aproveitamento >= 0.3 ? "warning" : "neutral"}>
                {Math.round(m.projecao.aproveitamento * 100)}% da capacidade
              </Badge>
            )}
          </div>

          <p className="mt-4 flex items-start gap-1.5 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-500 dark:bg-white/5 dark:text-zinc-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Isto é o teto que a estrutura de hoje comporta, não uma meta nem uma previsão. A conta só considera perfis ativos
            que já estão dentro de grupos com parceria ativa. Cadência humana real é sempre menor que o teto — e forçar o teto
            é exatamente o que faz um perfil real ser sinalizado como spam.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Fator({ valor, rotulo, destaque }: { valor: number; rotulo: string; destaque?: boolean }) {
  return (
    <span
      className={
        destaque
          ? "rounded-lg bg-primary-100 px-3 py-1.5 dark:bg-primary-500/10"
          : "rounded-lg bg-zinc-100 px-3 py-1.5 dark:bg-white/5"
      }
    >
      <strong className={destaque ? "text-primary-700 dark:text-primary-300" : "text-zinc-900 dark:text-white"}>
        {valor}
      </strong>{" "}
      <span className="text-xs">{rotulo}</span>
    </span>
  );
}

function ListaCliques({ titulo, descricao, itens }: { titulo: string; descricao: string; itens: ResumoCliques[] }) {
  const maximo = Math.max(1, ...itens.map((i) => i.cliques));

  return (
    <Card>
      <CardContent>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">{titulo}</h2>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{descricao}</p>

        {itens.length === 0 ? (
          <EmptyState
            icon={MousePointerClick}
            title="Nenhum link rastreado ainda"
            description="Os links nascem quando você distribui um pacote nos grupos."
          />
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {itens.map((item) => (
              <li key={item.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm text-zinc-700 dark:text-zinc-200">{item.nome}</span>
                  <span className="shrink-0 text-sm font-semibold text-zinc-900 dark:text-white">{item.cliques}</span>
                </div>
                {/* Barra proporcional ao maior valor: comparar volumes lado a
                    lado é mais rápido de ler que uma coluna de números. */}
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/5">
                  <div
                    className="h-full rounded-full bg-primary-500"
                    style={{ width: `${Math.round((item.cliques / maximo) * 100)}%` }}
                  />
                </div>
                <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                  {item.links} link(s) gerado(s)
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
