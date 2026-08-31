-- Distribuição — trilho ASSISTIDO (perfis de divulgação, grupos parceiros,
-- fila manual e links rastreados) + campos novos do pacote (variações de
-- copy e álbum de imagens).
-- Ver plano-acao-claude-code-distribuicao.md (PROMPT 2) e DECISIONS.md
-- "Distribuição — PROMPT 2: trilho assistido" (2026-08-31).
--
-- Só ADIÇÕES: as duas colunas novas em `distribution_packages` são
-- nullable/com default, então código antigo continua funcionando enquanto
-- esta migração já estiver aplicada — que é a ordem exigida pelo checklist
-- de deploy do README desde o incidente P2022 de 2026-08-30.

-- CreateEnum
CREATE TYPE "GrupoParceiroStatus" AS ENUM ('ATIVO', 'PAUSADO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "PerfilGrupoStatus" AS ENUM ('AGUARDANDO_APROVACAO', 'APROVADO', 'ENTROU', 'REMOVIDO');

-- CreateEnum
CREATE TYPE "FilaDistribuicaoStatus" AS ENUM ('PENDENTE', 'POSTADO', 'PULADO');

-- AlterTable
ALTER TABLE "distribution_packages" ADD COLUMN IF NOT EXISTS "copy_variacoes" JSONB;
ALTER TABLE "distribution_packages" ADD COLUMN IF NOT EXISTS "imagens_alvo" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "divulgacao_perfis" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "divulgacao_perfis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grupos_parceiros" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "admin_contato" TEXT,
    "valor_pago_centavos" INTEGER NOT NULL DEFAULT 0,
    "periodo_inicio" TIMESTAMP(3) NOT NULL,
    "periodo_fim" TIMESTAMP(3),
    "confirma_divulgacao_parceria" BOOLEAN NOT NULL DEFAULT false,
    "membros_aprox" INTEGER,
    "status" "GrupoParceiroStatus" NOT NULL DEFAULT 'ATIVO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grupos_parceiros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfil_grupo" (
    "id" TEXT NOT NULL,
    "divulgacao_perfil_id" TEXT NOT NULL,
    "grupo_parceiro_id" TEXT NOT NULL,
    "data_entrada" TIMESTAMP(3),
    "status" "PerfilGrupoStatus" NOT NULL DEFAULT 'AGUARDANDO_APROVACAO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perfil_grupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fila_distribuicao_manual" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "divulgacao_perfil_id" TEXT NOT NULL,
    "grupo_parceiro_id" TEXT NOT NULL,
    "data_prevista" TIMESTAMP(3) NOT NULL,
    "status" "FilaDistribuicaoStatus" NOT NULL DEFAULT 'PENDENTE',
    "postado_em" TIMESTAMP(3),
    "observacao" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fila_distribuicao_manual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribution_links" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "divulgacao_perfil_id" TEXT,
    "grupo_parceiro_id" TEXT,
    "code" TEXT NOT NULL,
    "destino_url" TEXT NOT NULL,
    "clique_count" INTEGER NOT NULL DEFAULT 0,
    "ultimo_clique_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distribution_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "divulgacao_perfis_user_id_idx" ON "divulgacao_perfis"("user_id");

-- CreateIndex
CREATE INDEX "grupos_parceiros_user_id_idx" ON "grupos_parceiros"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "perfil_grupo_divulgacao_perfil_id_grupo_parceiro_id_key" ON "perfil_grupo"("divulgacao_perfil_id", "grupo_parceiro_id");

-- CreateIndex
CREATE INDEX "perfil_grupo_grupo_parceiro_id_idx" ON "perfil_grupo"("grupo_parceiro_id");

-- CreateIndex
-- Regra "não repetir o mesmo perfil no mesmo grupo no mesmo dia", garantida
-- no banco (não só na validação da aplicação).
CREATE UNIQUE INDEX "fila_distribuicao_manual_divulgacao_perfil_id_grupo_parceir_key" ON "fila_distribuicao_manual"("divulgacao_perfil_id", "grupo_parceiro_id", "data_prevista");

-- CreateIndex
CREATE INDEX "fila_distribuicao_manual_user_id_data_prevista_status_idx" ON "fila_distribuicao_manual"("user_id", "data_prevista", "status");

-- CreateIndex
CREATE INDEX "fila_distribuicao_manual_package_id_idx" ON "fila_distribuicao_manual"("package_id");

-- CreateIndex
CREATE UNIQUE INDEX "distribution_links_code_key" ON "distribution_links"("code");

-- CreateIndex
CREATE UNIQUE INDEX "distribution_links_package_id_divulgacao_perfil_id_grupo_par_key" ON "distribution_links"("package_id", "divulgacao_perfil_id", "grupo_parceiro_id");

-- CreateIndex
CREATE INDEX "distribution_links_package_id_idx" ON "distribution_links"("package_id");

-- AddForeignKey
ALTER TABLE "divulgacao_perfis" ADD CONSTRAINT "divulgacao_perfis_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grupos_parceiros" ADD CONSTRAINT "grupos_parceiros_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil_grupo" ADD CONSTRAINT "perfil_grupo_divulgacao_perfil_id_fkey" FOREIGN KEY ("divulgacao_perfil_id") REFERENCES "divulgacao_perfis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil_grupo" ADD CONSTRAINT "perfil_grupo_grupo_parceiro_id_fkey" FOREIGN KEY ("grupo_parceiro_id") REFERENCES "grupos_parceiros"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fila_distribuicao_manual" ADD CONSTRAINT "fila_distribuicao_manual_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fila_distribuicao_manual" ADD CONSTRAINT "fila_distribuicao_manual_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "distribution_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fila_distribuicao_manual" ADD CONSTRAINT "fila_distribuicao_manual_divulgacao_perfil_id_fkey" FOREIGN KEY ("divulgacao_perfil_id") REFERENCES "divulgacao_perfis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fila_distribuicao_manual" ADD CONSTRAINT "fila_distribuicao_manual_grupo_parceiro_id_fkey" FOREIGN KEY ("grupo_parceiro_id") REFERENCES "grupos_parceiros"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_links" ADD CONSTRAINT "distribution_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_links" ADD CONSTRAINT "distribution_links_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "distribution_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_links" ADD CONSTRAINT "distribution_links_divulgacao_perfil_id_fkey" FOREIGN KEY ("divulgacao_perfil_id") REFERENCES "divulgacao_perfis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_links" ADD CONSTRAINT "distribution_links_grupo_parceiro_id_fkey" FOREIGN KEY ("grupo_parceiro_id") REFERENCES "grupos_parceiros"("id") ON DELETE SET NULL ON UPDATE CASCADE;
