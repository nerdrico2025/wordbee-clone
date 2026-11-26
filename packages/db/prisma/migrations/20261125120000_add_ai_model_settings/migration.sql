-- Modelo de IA configurável pelo painel — ver DECISIONS.md "modelo de IA
-- configurável pelo painel" (2026-11-25).
--
-- Puramente aditiva: só cria uma tabela nova e duas colunas nullable em
-- "articles". Nenhuma coluna existente é tocada, então o código antigo
-- (que não conhece nada disto) continua funcionando com o banco já
-- migrado — por isso a migration pode (e deve) ser aplicada ANTES do deploy
-- do código novo. IF NOT EXISTS / DO-blocks tornam o script idempotente.

-- Model id efetivamente usado em cada artigo (nulo nos artigos antigos).
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "modelo_texto" TEXT;
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "modelo_imagem" TEXT;

CREATE TABLE IF NOT EXISTS "ai_model_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "text_provider" "AiProvider",
    "text_model" TEXT,
    "image_provider" "AiProvider",
    "image_model" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_model_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_model_settings_user_id_key" ON "ai_model_settings"("user_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_model_settings_user_id_fkey') THEN
    ALTER TABLE "ai_model_settings" ADD CONSTRAINT "ai_model_settings_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
