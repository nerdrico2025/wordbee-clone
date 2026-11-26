-- Nome amigável do modelo escolhido em Chaves de API → Modelos de IA, para
-- as telas mostrarem "OpenRouter (<nome>)" sem consultar o catálogo a cada
-- renderização. Ver DECISIONS.md "rótulo de modelo dinâmico" (2026-11-26).
--
-- Puramente aditiva e idempotente: duas colunas nullable. O código antigo
-- não as conhece e segue funcionando; pode ser aplicada antes do deploy.
ALTER TABLE "ai_model_settings" ADD COLUMN IF NOT EXISTS "text_model_name" TEXT;
ALTER TABLE "ai_model_settings" ADD COLUMN IF NOT EXISTS "image_model_name" TEXT;
