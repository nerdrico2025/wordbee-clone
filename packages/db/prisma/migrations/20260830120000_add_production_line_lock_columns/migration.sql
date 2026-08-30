-- Scheduler cron+Postgres (substitui o lock via Redis do BullMQ) — ver
-- DECISIONS.md "scheduler cron+Postgres" (2026-08-30).
--
-- IF NOT EXISTS por segurança extra: torna este script seguro de rodar mais
-- de uma vez em produção (idempotente) mesmo fora do controle normal do
-- Prisma Migrate (que já rastreia migrações aplicadas em `_prisma_migrations`
-- e não reaplicaria esta por conta própria). Nenhuma coluna existente é
-- tocada — em particular, `next_run_at` das linhas ativas não é lido nem
-- escrito por esta migração, então o agendamento já calculado é preservado
-- exatamente como estava.
ALTER TABLE "production_lines" ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMP(3);
ALTER TABLE "production_lines" ADD COLUMN IF NOT EXISTS "locked_by" TEXT;
