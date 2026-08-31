# Variáveis de ambiente — Vercel (web) + worker externo

Este projeto tem **dois processos**: o app **web** (Next.js, pode rodar na Vercel como serverless) e o **worker** (scheduler cron+Postgres, processo *always-on* que executa as Linhas de Produção — ver DECISIONS.md "scheduler cron+Postgres"). A Vercel **não suporta processos de longa duração** — funções serverless são efêmeras e não conseguem manter um processo fazendo polling continuamente. Por isso:

- A **Vercel roda só o app web** (login, telas, geração unitária "Criar Artigo", API routes).
- O **worker precisa rodar em outro lugar**, um serviço always-on. **Ambiente atual de produção: EasyPanel** (Docker, num VPS próprio) — ver README.md ("Deploy no EasyPanel"). Fly.io ou um VPS "cru" com Docker Compose (`docker-compose.prod.yml`, também no README) funcionam do mesmo jeito, já que o worker é só um container Docker comum. Sem o worker rodando, as Linhas de Produção ficam paradas — só a geração unitária continua funcionando pela Vercel.

> ⚠️ **Nunca defina `NODE_ENV`** em nenhuma dessas plataformas — a Vercel e o Next.js já definem o valor certo sozinhos; sobrescrever quebra o build (bug documentado em `DECISIONS.md`/`PROGRESS.md`).

> ⚠️ **Storage de imagens de referência**: só o driver `local` (disco) está implementado hoje — `STORAGE_DRIVER=s3` existe como opção na Vercel mas **lança erro em runtime**, não é implementado ainda. Disco local **não funciona** nesse cenário de deploy dividido (Vercel é efêmera; o worker roda em outro servidor e não enxerga o disco da Vercel). Se for usar **Imagens de Referência** nas Linhas de Produção com o worker externo, implemente o driver S3 antes (a abstração já existe em `packages/shared/src/storage/`) — sem isso, cadastre linhas sem imagens de referência.

> ⚠️ **Timeout de função serverless**: o endpoint de geração unitária (`/api/articles/generate`) transmite progresso em streaming e pode levar mais de 60s (título + conteúdo + imagem + publicação). O código já pede `maxDuration = 300`, mas o **plano Hobby da Vercel limita a 10–60s** independente disso — só planos Pro/Enterprise (com Fluid Compute) respeitam os 300s. No plano Hobby, artigos mais demorados podem ser cortados no meio.

---

## (a) Variáveis para o app web na Vercel

| Variável | Para que serve | Obrigatória? | Exemplo / como obter |
|---|---|---|---|
| `DATABASE_URL` | Conexão com o Postgres (Prisma) — também é onde o web escreve `status`/`nextRunAt` da linha, sem passar por fila nenhuma | **Obrigatória** | `postgresql://usuario:senha@host-pooler:5432/banco?sslmode=require&pgbouncer=true&connection_limit=10` — em produção, a connection string do endpoint **pooled** do **Neon** (ambiente atual), com `pgbouncer=true` para evitar prepared statements presas a conexões físicas recicladas pelo pooler (ver `DECISIONS.md`, 2026-08-31). **Precisa ser idêntica à do worker no EasyPanel** — se divergir, o worker nunca vê as linhas que o web cria/atualiza. |
| `REDIS_URL` | Conexão com o Redis (usado pelo web só para rate limit de login e para ler o heartbeat de saúde do worker — badge do Dashboard) | **Obrigatória** | string de conexão **TCP/Redis** — em produção, a connection string do **Upstash** (ambiente atual; não a REST URL — `ioredis` precisa do protocolo Redis nativo). **Precisa ser idêntica à do worker no EasyPanel** — se divergir, o badge de saúde do worker no Dashboard mostra "offline" mesmo com o worker rodando normalmente. |
| `SESSION_SECRET` | Assina o cookie de sessão (JWT HS256) | **Obrigatória** | Gerar com `openssl rand -base64 48` |
| `ENCRYPTION_KEY` | Chave-mestra AES-256-GCM para criptografar as chaves de API e senhas de aplicação WordPress salvas no banco | **Obrigatória** | Gerar com `openssl rand -base64 32` — **guarde em local seguro**, se perder essa chave os dados criptografados ficam ilegíveis |
| `SESSION_TTL_HOURS` | Duração da sessão de login, em horas | Opcional (padrão `168` = 7 dias) | `168` |
| `SESSION_COOKIE_NAME` | Nome do cookie httpOnly da sessão | Opcional (padrão `wordbee_session`) | `wordbee_session` |
| `STORAGE_DRIVER` | Driver de storage das imagens de referência | Opcional (padrão `local`) | Ver aviso acima — só use `local` se souber que não vai precisar de imagens de referência nesse ambiente |
| `STORAGE_LOCAL_PATH` | Pasta onde ficam as imagens de referência (se `STORAGE_DRIVER=local`) | Só se `STORAGE_DRIVER=local` | Não recomendado na Vercel (filesystem efêmero) |
| `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` | Tentativas de login permitidas por janela | Opcional (padrão `5`) | `5` |
| `LOGIN_RATE_LIMIT_WINDOW_MINUTES` | Duração da janela do rate limit de login | Opcional (padrão `15`) | `15` |
| `OPENAI_TEXT_MODEL` | Override do modelo de texto da OpenAI | Opcional (padrão `gpt-4o`) | `gpt-4o` |
| `OPENAI_IMAGE_MODEL` | Override do modelo de imagem da OpenAI | Opcional (padrão `dall-e-3`) | `dall-e-3` |
| `GEMINI_TEXT_MODEL` | Override do modelo de texto da Gemini | Opcional (padrão `gemini-3.6-flash`) | `gemini-3.6-flash` — só mude se a Google descontinuar o modelo |
| `GEMINI_IMAGE_MODEL` | Override do modelo de imagem da Gemini | Opcional (padrão `gemini-2.5-flash-image`) | `gemini-2.5-flash-image` |
| `GROK_TEXT_MODEL` | Override do modelo de texto do Grok | Opcional (padrão `grok-2-latest`) | `grok-2-latest` |
| `GROK_IMAGE_MODEL` | Override do modelo de imagem do Grok | Opcional (padrão `grok-2-image`) | `grok-2-image` |
| `STABILITY_IMAGE_MODEL` | Override do modelo da Stability AI | Opcional (padrão `sd3.5-large`) | `sd3.5-large` |
| `OPENROUTER_DEFAULT_MODEL` | Override do modelo de texto usado via OpenRouter | Opcional (padrão `deepseek/deepseek-v4-flash-0731`) | `deepseek/deepseek-v4-flash-0731` — confira o slug atual em https://openrouter.ai/models antes de trocar |
| `OPENROUTER_IMAGE_DEFAULT_MODEL` | Override do modelo de imagem usado via OpenRouter | Opcional (padrão `google/gemini-2.5-flash-image`) | `google/gemini-2.5-flash-image` ("Nano Banana") — confira em https://openrouter.ai/api/v1/models?output_modalities=image antes de trocar |

**Não precisam ir na Vercel:**
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` — só usadas localmente/uma vez para rodar `npm run db:seed` contra o banco de produção (rode isso da sua máquina, apontando `DATABASE_URL` para o Postgres de produção, antes do primeiro deploy).
- `OPENAI_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`, `STABILITY_API_KEY` — o app é BYOK: as chaves reais são cadastradas pela tela **Chaves de API** dentro do próprio app e ficam criptografadas no banco, não em variável de ambiente.
- `PORT` — a Vercel gerencia isso sozinha.

---

## (b) Variáveis para o worker (fora da Vercel — EasyPanel, ambiente atual)

| Variável | Para que serve | Obrigatória? | Exemplo / como obter |
|---|---|---|---|
| `DATABASE_URL` | Mesmo Postgres do app web — fonte de verdade do agendamento (`next_run_at`) e do lock de execução por linha | **Obrigatória** | **A mesma string de conexão usada na Vercel** |
| `REDIS_URL` | Mesmo Redis do app web (semáforo de concorrência por IA + heartbeat de saúde) | **Obrigatória** | **A mesma string de conexão (TCP) usada na Vercel** |
| `ENCRYPTION_KEY` | Descriptografa as chaves de API e senhas de aplicação para chamar IA/WordPress | **Obrigatória** | **Precisa ser exatamente a mesma chave usada na Vercel** — se divergir, o worker não consegue ler nada que o web salvou |
| `STORAGE_DRIVER` / `STORAGE_LOCAL_PATH` | Onde ler as imagens de referência das linhas | Opcional | Se usar `local`, aponte para um disco persistente do próprio host do worker (ex.: volume do EasyPanel) — **não** o disco da Vercel |
| `AI_PROVIDER_CONCURRENCY` | Chamadas simultâneas de IA por provedor entre todas as linhas ativas | Opcional (padrão `3`) | `3` |
| `WORKER_CONCURRENCY` | Quantas linhas o scheduler reivindica/processa em paralelo por tick | Opcional (padrão `5`) | `5` |
| `SCHEDULER_INTERVAL_MS` | Intervalo do polling cron+Postgres | Opcional (padrão `90000` = 1.5min) | `90000` |
| `LINE_LOCK_STALE_MS` | Quando um lock de execução travado é considerado morto | Opcional (padrão `1200000` = 20min) | `1200000` |
| `OPENAI_TEXT_MODEL` … `OPENROUTER_IMAGE_DEFAULT_MODEL` | Mesmos overrides de modelo do app web | Opcional | Mantenha **iguais** aos da Vercel para consistência |

**Não precisa no worker:** `SESSION_SECRET`, `SESSION_TTL_HOURS`, `SESSION_COOKIE_NAME`, `LOGIN_RATE_LIMIT_*` (o worker não lida com login/sessão) e `ADMIN_*` (só usado pelo seed).

O worker tem `apps/worker/Dockerfile` pronto — no EasyPanel, aponte o build para esse Dockerfile (contexto = raiz do repositório) e configure as variáveis acima no painel do serviço "App". Passo a passo completo em `README.md` ("Deploy no EasyPanel").

---

## Postgres e Redis gerenciados

Este projeto **não depende de infraestrutura da Vercel nem do EasyPanel** para banco de dados ou fila — é BYOK e de uso pessoal. **Ambiente atual de produção:**

- **Postgres**: **Neon** (gerenciado, plano gratuito, endpoint público com TLS). Precisa ser alcançável tanto pela Vercel (web) quanto pelo worker (EasyPanel) — a mesma `DATABASE_URL` nos dois.
- **Redis**: **Upstash** (gerenciado, plano gratuito, endpoint público com TLS, protocolo Redis nativo — não a REST URL). Mesma lógica: a mesma `REDIS_URL` na Vercel e no worker. **Nunca** o Redis interno de um serviço do EasyPanel — a Vercel roda com IP de saída dinâmico e não alcança redes privadas de forma confiável (ver aviso completo em README.md, "Deploy no EasyPanel").

Qualquer outro provedor gerenciado com endpoint público e TLS (Supabase, outro Redis compatível) funciona do mesmo jeito — Neon e Upstash são só o que está em uso hoje.

Depois de provisionar os dois, rode a migração e o seed uma vez (da sua máquina, com `DATABASE_URL` apontando para o Postgres de produção):

```bash
npm run db:migrate:deploy
npm run db:seed
```

---

## Tabela consolidada (para colar direto no painel da Vercel)

| Nome | Valor de exemplo / instrução |
|---|---|
| `DATABASE_URL` | `postgresql://usuario:senha@host-pooler:5432/banco?sslmode=require&pgbouncer=true&connection_limit=10` |
| `REDIS_URL` | `redis://default:senha@host:6379` |
| `SESSION_SECRET` | gerar com `openssl rand -base64 48` |
| `ENCRYPTION_KEY` | gerar com `openssl rand -base64 32` |
| `SESSION_TTL_HOURS` | `168` |
| `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` | `5` |
| `LOGIN_RATE_LIMIT_WINDOW_MINUTES` | `15` |
