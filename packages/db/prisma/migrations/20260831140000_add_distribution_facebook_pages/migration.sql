-- Distribuição — trilho automático (Páginas do Facebook via Graph API oficial).
-- Ver plano-acao-claude-code-distribuicao.md (PROMPT 1) e DECISIONS.md
-- "Distribuição — trilho automático via Graph API" (2026-08-31).
--
-- Só ADIÇÕES: nenhuma tabela ou coluna existente é lida, alterada ou
-- removida por este script. Seguindo o checklist de deploy do README
-- (seção "Deploy"), esta migração deve ser aplicada em produção ANTES de
-- deployar o código novo (web e worker) — foi exatamente a inversão dessa
-- ordem que causou o incidente P2022 de 2026-08-30.

-- CreateEnum
CREATE TYPE "DistributionPackageType" AS ENUM ('CAPTACAO', 'DIRETO_SITE');

-- CreateEnum
CREATE TYPE "DistributionPackageStatus" AS ENUM ('PENDENTE', 'PRONTO', 'FALHA');

-- CreateEnum
CREATE TYPE "PageDistributionStatus" AS ENUM ('PENDENTE', 'AGENDADO', 'PUBLICADO', 'FALHA');

-- CreateTable
CREATE TABLE "facebook_pages" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "access_token_encrypted" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "masked_hint" TEXT NOT NULL,
    "status_validacao" BOOLEAN NOT NULL DEFAULT false,
    "last_validated_at" TIMESTAMP(3),
    "last_error" TEXT,
    "wp_site_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facebook_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribution_packages" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "article_id" TEXT,
    "tipo" "DistributionPackageType" NOT NULL,
    "status" "DistributionPackageStatus" NOT NULL DEFAULT 'PENDENTE',
    "imagens" TEXT[],
    "copy_descricao" TEXT,
    "copy_comentario" TEXT,
    "link_destino" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erro_msg" TEXT,
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distribution_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_distribution_posts" (
    "id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "facebook_page_id" TEXT NOT NULL,
    "status" "PageDistributionStatus" NOT NULL DEFAULT 'AGENDADO',
    "fb_post_id" TEXT,
    "fb_comment_id" TEXT,
    "erro_msg" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_distribution_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "facebook_pages_user_id_page_id_key" ON "facebook_pages"("user_id", "page_id");

-- CreateIndex
CREATE INDEX "facebook_pages_user_id_idx" ON "facebook_pages"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "distribution_packages_article_id_tipo_key" ON "distribution_packages"("article_id", "tipo");

-- CreateIndex
CREATE INDEX "distribution_packages_status_created_at_idx" ON "distribution_packages"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "page_distribution_posts_package_id_facebook_page_id_key" ON "page_distribution_posts"("package_id", "facebook_page_id");

-- CreateIndex
CREATE INDEX "page_distribution_posts_status_scheduled_for_idx" ON "page_distribution_posts"("status", "scheduled_for");

-- AddForeignKey
ALTER TABLE "facebook_pages" ADD CONSTRAINT "facebook_pages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facebook_pages" ADD CONSTRAINT "facebook_pages_wp_site_id_fkey" FOREIGN KEY ("wp_site_id") REFERENCES "wp_sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_packages" ADD CONSTRAINT "distribution_packages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_packages" ADD CONSTRAINT "distribution_packages_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_distribution_posts" ADD CONSTRAINT "page_distribution_posts_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "distribution_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_distribution_posts" ADD CONSTRAINT "page_distribution_posts_facebook_page_id_fkey" FOREIGN KEY ("facebook_page_id") REFERENCES "facebook_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
