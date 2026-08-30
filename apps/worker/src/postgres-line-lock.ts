import { prisma, type ProductionLine } from "@wordbee/db";

// Se uma execução trava (worker morto/crashado no meio do processamento),
// a linha não pode ficar bloqueada para sempre. Depois deste tempo, um
// lockedAt "velho" é tratado como morto e a linha volta a ser reivindicável
// — mesmo papel que o `stalledInterval` do BullMQ cumpria antes, só que via
// Postgres em vez de Redis. Geração de artigo (texto+imagem+upload WP, com
// até 3 tentativas de retry) pode legitimamente levar minutos; 20 min dá
// bastante margem sem deixar uma linha morta presa por muito tempo. Ver
// DECISIONS.md "scheduler cron+Postgres".
const LOCK_STALE_MS = Number(process.env.LINE_LOCK_STALE_MS ?? String(20 * 60_000));

/**
 * Reivindica até `limit` linhas ATIVA cujo `nextRunAt` já venceu e que não
 * estão bloqueadas (ou cujo lock está velho o suficiente para ser
 * considerado morto). Atômico entre chamadas concorrentes: o `FOR UPDATE
 * SKIP LOCKED` dentro do CTE garante que duas transações rodando ao mesmo
 * tempo (ex.: dois ticks do cron sobrepostos, ou duas réplicas do worker)
 * nunca reivindicam a mesma linha — uma pega o lock de linha real do
 * Postgres, a outra pula essa linha silenciosamente e segue para a próxima
 * candidata. Isso é o que substitui o lock por linha via Redis
 * (`SET NX`) da arquitetura antiga.
 *
 * A query só devolve `id` do RETURNING — os campos completos são buscados
 * depois via `findMany` (que já devolve objetos com os nomes de campo do
 * Prisma, camelCase) em vez de mapear manualmente as colunas snake_case
 * que uma query raw devolveria. Um pequeno round-trip a mais, desprezível
 * perto do ganho de não reimplementar o mapeamento de campos à mão.
 */
export async function claimDueLines(workerId: string, limit: number): Promise<ProductionLine[]> {
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS);

  // `next_run_at`/`locked_at` são `timestamp(3) without time zone` (sem
  // fuso embutido), mas guardam dígitos UTC — é o que o Prisma sempre
  // escreve/lê para essas colunas a partir de um `Date` do JS (o cliente do
  // Prisma ignora o TimeZone de sessão do Postgres nesse processo). `now()`
  // é `timestamptz`. Qualquer lugar onde SQL bruto mistura os dois precisa
  // de conversão explícita nos DOIS sentidos, ou o Postgres aplica uma
  // conversão implícita usando o TimeZone da SESSÃO — que não tem nenhuma
  // relação com UTC:
  //   - LEITURA (comparar coluna naive contra `now()`): `AT TIME ZONE 'UTC'`
  //     na coluna reinterpreta os dígitos armazenados como UTC, produzindo
  //     um instante de verdade para comparar com `now()`.
  //   - ESCRITA (gravar `now()` numa coluna naive): sem o mesmo tratamento,
  //     `SET locked_at = now()` faz o Postgres converter o instante atual
  //     para "wall clock" do TimeZone de sessão antes de gravar — em
  //     qualquer servidor cujo TimeZone padrão não seja UTC (confirmado na
  //     prática: um Postgres local com `initdb` herdando o fuso do SO, ex.
  //     America/Sao_Paulo, UTC-3), o valor gravado fica deslocado várias
  //     horas do UTC real, e uma leitura seguinte via `AT TIME ZONE 'UTC'"
  //     enxerga esse lock como "velho" quase na hora em que foi criado —
  //     bug real de verdade pego só porque este módulo é testado contra
  //     Postgres real (`postgres-line-lock.integration.test.ts`); nunca
  //     apareceria com Prisma mockado. `now() AT TIME ZONE 'UTC'` extrai a
  //     representação UTC do instante atual antes de gravar, igualando a
  //     convenção do Prisma. Ver DECISIONS.md "scheduler cron+Postgres".
  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    WITH due AS (
      SELECT id
      FROM production_lines
      WHERE status = 'ATIVA'::"LineStatus"
        AND next_run_at IS NOT NULL
        AND (next_run_at AT TIME ZONE 'UTC') <= now()
        AND (locked_at IS NULL OR (locked_at AT TIME ZONE 'UTC') < ${staleBefore})
      ORDER BY next_run_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE production_lines pl
    SET locked_at = (now() AT TIME ZONE 'UTC'), locked_by = ${workerId}
    FROM due
    WHERE pl.id = due.id
    RETURNING pl.id;
  `;

  if (claimed.length === 0) return [];

  const ids = claimed.map((row) => row.id);
  const lines = await prisma.productionLine.findMany({ where: { id: { in: ids } } });
  const byId = new Map(lines.map((line) => [line.id, line]));

  // Preserva a ordem de reivindicação (nextRunAt asc) — findMany não garante
  // ordem para `id: { in: [...] }`. O `.filter` cobre o caso raro (mas
  // possível) de a linha ter sido deletada entre o UPDATE acima e este
  // findMany.
  return ids.map((id) => byId.get(id)).filter((line): line is ProductionLine => line !== undefined);
}

/**
 * Libera o lock de execução de uma linha. Chamado sempre no `finally` de um
 * tick, depois que toda escrita de resultado (nextRunAt, status, contadores)
 * já foi commitada — nunca antes, e nunca de dentro do processamento em si.
 * Isso preserva a garantia mais importante herdada da arquitetura antiga:
 * o reagendamento (escrita de `nextRunAt`) sempre acontece por completo
 * antes da linha voltar a ficar disponível para uma nova reivindicação.
 *
 * `updateMany` (não `update`) de propósito: se a linha foi deletada
 * enquanto estava em execução, não há nada para liberar — não deve lançar.
 */
export async function releaseLine(lineId: string): Promise<void> {
  await prisma.productionLine.updateMany({
    where: { id: lineId },
    data: { lockedAt: null, lockedBy: null },
  });
}
