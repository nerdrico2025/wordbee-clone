import { prisma, type DistributionPackage, type PageDistributionPost } from "@wordbee/db";

/**
 * Reivindicação atômica de trabalho de distribuição, exatamente no mesmo
 * desenho de `postgres-line-lock.ts` (`FOR UPDATE SKIP LOCKED` dentro de um
 * CTE + `UPDATE ... RETURNING` na mesma instrução). Ver DECISIONS.md
 * "scheduler cron+Postgres" para o porquê desse desenho em vez de fila no
 * Redis.
 *
 * ATENÇÃO ao mesmo detalhe de fuso que já causou um bug real lá: as colunas
 * `scheduled_for`/`locked_at` são `timestamp(3) without time zone` com
 * dígitos UTC (é o que o Prisma escreve a partir de um `Date`), enquanto
 * `now()` é `timestamptz`. Misturar os dois em SQL bruto sem
 * `AT TIME ZONE 'UTC'` explícito nos DOIS sentidos faz o Postgres aplicar o
 * TimeZone da SESSÃO — num servidor em America/Sao_Paulo, por exemplo, um
 * lock recém-criado já nasce "velho" 3 horas atrás. Por isso toda
 * comparação e toda escrita aqui usa a conversão explícita.
 */

const LOCK_STALE_MS = Number(process.env.DISTRIBUTION_LOCK_STALE_MS ?? String(10 * 60_000));

/**
 * Reivindica pacotes ainda não montados (status PENDENTE). Não há
 * `scheduled_for` aqui: um pacote deve ser montado assim que o artigo é
 * publicado — o espaçamento acontece depois, no agendamento de cada
 * publicação de Página.
 */
export async function claimPendingPackages(workerId: string, limit: number): Promise<DistributionPackage[]> {
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS);

  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    WITH due AS (
      SELECT id
      FROM distribution_packages
      WHERE status = 'PENDENTE'::"DistributionPackageStatus"
        AND (locked_at IS NULL OR (locked_at AT TIME ZONE 'UTC') < ${staleBefore})
      ORDER BY created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE distribution_packages dp
    SET locked_at = (now() AT TIME ZONE 'UTC'), locked_by = ${workerId}
    FROM due
    WHERE dp.id = due.id
    RETURNING dp.id;
  `;

  return hydrate(claimed, (ids) => prisma.distributionPackage.findMany({ where: { id: { in: ids } } }));
}

/**
 * Reivindica publicações de Página cujo horário agendado já venceu.
 * PENDENTE e AGENDADO são ambos reivindicáveis: AGENDADO é o estado normal
 * de espera, PENDENTE é o de "nova tentativa marcada depois de uma falha
 * transitória" — do ponto de vista de quem processa, os dois querem dizer
 * "publique quando `scheduled_for` vencer".
 */
export async function claimDuePagePosts(workerId: string, limit: number): Promise<PageDistributionPost[]> {
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS);

  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    WITH due AS (
      SELECT id
      FROM page_distribution_posts
      WHERE status IN ('PENDENTE'::"PageDistributionStatus", 'AGENDADO'::"PageDistributionStatus")
        AND (scheduled_for AT TIME ZONE 'UTC') <= now()
        AND (locked_at IS NULL OR (locked_at AT TIME ZONE 'UTC') < ${staleBefore})
      ORDER BY scheduled_for ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE page_distribution_posts pdp
    SET locked_at = (now() AT TIME ZONE 'UTC'), locked_by = ${workerId}
    FROM due
    WHERE pdp.id = due.id
    RETURNING pdp.id;
  `;

  return hydrate(claimed, (ids) => prisma.pageDistributionPost.findMany({ where: { id: { in: ids } } }));
}

export async function releasePackage(packageId: string): Promise<void> {
  await prisma.distributionPackage.updateMany({
    where: { id: packageId },
    data: { lockedAt: null, lockedBy: null },
  });
}

export async function releasePagePost(postId: string): Promise<void> {
  await prisma.pageDistributionPost.updateMany({
    where: { id: postId },
    data: { lockedAt: null, lockedBy: null },
  });
}

/**
 * O RETURNING só devolve `id`; os campos completos vêm de um `findMany` do
 * Prisma (que já entrega camelCase) em vez de mapear snake_case à mão —
 * mesmo trade-off aceito em `postgres-line-lock.ts`. O `.filter` cobre a
 * linha deletada entre o UPDATE e esta leitura; a reordenação preserva a
 * ordem de reivindicação, que `findMany` com `id: { in: [...] }` não garante.
 */
async function hydrate<T extends { id: string }>(
  claimed: { id: string }[],
  fetchAll: (ids: string[]) => Promise<T[]>
): Promise<T[]> {
  if (claimed.length === 0) return [];
  const ids = claimed.map((row) => row.id);
  const rows = await fetchAll(ids);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is T => row !== undefined);
}
