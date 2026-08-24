-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('OPENAI', 'GEMINI', 'GROK', 'STABILITY');

-- CreateEnum
CREATE TYPE "ApiKeyKind" AS ENUM ('TEXTO', 'IMAGEM', 'AMBOS');

-- CreateEnum
CREATE TYPE "ArticleType" AS ENUM ('RECEITA', 'TUTORIAL', 'PASSO_A_PASSO', 'NOTICIAS', 'NOVIDADES', 'CURIOSIDADES', 'OPINIAO', 'REVIEWS', 'GUIA_COMPLETO', 'COMPARATIVO', 'LISTICLE', 'FAQ', 'ANALISE', 'ESTUDO_DE_CASO');

-- CreateEnum
CREATE TYPE "WpPostStatus" AS ENUM ('PUBLISH', 'DRAFT');

-- CreateEnum
CREATE TYPE "LineStatus" AS ENUM ('ATIVA', 'PAUSADA', 'CONCLUIDA');

-- CreateEnum
CREATE TYPE "TitleStatus" AS ENUM ('NA_FILA', 'USADO', 'DESCARTADO');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('PROCESSANDO', 'PUBLICADO', 'RASCUNHO', 'FALHA');

-- CreateEnum
CREATE TYPE "ArticleOrigin" AS ENUM ('MANUAL', 'LINHA');

-- CreateEnum
CREATE TYPE "RateLimitBehavior" AS ENUM ('ADIAR', 'PAUSAR');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "tema_ui" TEXT NOT NULL DEFAULT 'light',
    "totp_secret" TEXT,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL,
    "tipo" "ApiKeyKind" NOT NULL,
    "chave_encrypted" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "masked_hint" TEXT NOT NULL,
    "status_validacao" BOOLEAN NOT NULL DEFAULT false,
    "last_validated_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wp_sites" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "app_password_encrypted" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "last_test_at" TIMESTAMP(3),
    "last_test_ok" BOOLEAN,
    "last_test_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wp_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_lines" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "wp_site_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria_wp_id" INTEGER,
    "categoria_wp_nome" TEXT,
    "ia_texto" "AiProvider" NOT NULL,
    "ia_imagem" "AiProvider" NOT NULL,
    "tipo_artigo" "ArticleType" NOT NULL,
    "temas" TEXT[],
    "intervalo_min" INTEGER NOT NULL,
    "max_artigos" INTEGER,
    "gerados_count" INTEGER NOT NULL DEFAULT 0,
    "status_wp" "WpPostStatus" NOT NULL DEFAULT 'PUBLISH',
    "prompt_customizado" TEXT,
    "status" "LineStatus" NOT NULL DEFAULT 'ATIVA',
    "pause_reason" TEXT,
    "rate_limit_behavior" "RateLimitBehavior" NOT NULL DEFAULT 'ADIAR',
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "next_run_at" TIMESTAMP(3),
    "last_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "line_reference_images" (
    "id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "storage_url" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "line_reference_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "title_queue" (
    "id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "previsto_para" TIMESTAMP(3) NOT NULL,
    "status" "TitleStatus" NOT NULL DEFAULT 'NA_FILA',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "title_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "line_id" TEXT,
    "title_queue_id" TEXT,
    "wp_site_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" "ArticleType" NOT NULL,
    "origem" "ArticleOrigin" NOT NULL,
    "status" "ArticleStatus" NOT NULL DEFAULT 'PROCESSANDO',
    "content_html" TEXT,
    "excerpt" TEXT,
    "slug" TEXT,
    "image_url" TEXT,
    "wp_post_id" INTEGER,
    "wp_url" TEXT,
    "erro_msg" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_user_id_provider_tipo_key" ON "api_keys"("user_id", "provider", "tipo");

-- CreateIndex
CREATE INDEX "wp_sites_user_id_idx" ON "wp_sites"("user_id");

-- CreateIndex
CREATE INDEX "production_lines_next_run_at_status_idx" ON "production_lines"("next_run_at", "status");

-- CreateIndex
CREATE INDEX "production_lines_user_id_idx" ON "production_lines"("user_id");

-- CreateIndex
CREATE INDEX "line_reference_images_line_id_idx" ON "line_reference_images"("line_id");

-- CreateIndex
CREATE INDEX "title_queue_line_id_status_idx" ON "title_queue"("line_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "articles_title_queue_id_key" ON "articles"("title_queue_id");

-- CreateIndex
CREATE UNIQUE INDEX "articles_idempotency_key_key" ON "articles"("idempotency_key");

-- CreateIndex
CREATE INDEX "articles_created_at_idx" ON "articles"("created_at");

-- CreateIndex
CREATE INDEX "articles_line_id_created_at_idx" ON "articles"("line_id", "created_at");

-- CreateIndex
CREATE INDEX "articles_user_id_status_idx" ON "articles"("user_id", "status");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wp_sites" ADD CONSTRAINT "wp_sites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_lines" ADD CONSTRAINT "production_lines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_lines" ADD CONSTRAINT "production_lines_wp_site_id_fkey" FOREIGN KEY ("wp_site_id") REFERENCES "wp_sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_reference_images" ADD CONSTRAINT "line_reference_images_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "production_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_queue" ADD CONSTRAINT "title_queue_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "production_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "production_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_wp_site_id_fkey" FOREIGN KEY ("wp_site_id") REFERENCES "wp_sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_title_queue_id_fkey" FOREIGN KEY ("title_queue_id") REFERENCES "title_queue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
