# PROJECT-STATE.md — Estado real do Wordbee Clone

> Documento gerado por leitura direta do código, schema, migrations, histórico de commits e da documentação já existente (`PRD-Wordbee-Clone.md`, `DECISIONS.md`, `PROGRESS.md`, `README.md`, `VERCEL-ENV.md`) em 2026-08-31. Descreve o que **existe de fato**, não o que o PRD original pedia. Onde uma afirmação não pôde ser confirmada a partir do repositório (ex.: estado de um painel externo), está marcada **⚠ verificar com Rafael**. Tom técnico, sem otimismo — o que está incompleto ou divergente do PRD está dito explicitamente.

---

## 1. Visão geral e propósito

Aplicação web de uso pessoal (usuário único, sem cadastro público, sem planos/pagamentos) que gera e publica artigos em blogs WordPress via IA, de duas formas:

- **Criar Artigo**: geração unitária sob demanda (título → conteúdo → imagem → publicação), com progresso em streaming na tela.
- **Linhas de Produção**: automação contínua — uma "linha" configurada (site, tema, tipo de artigo, intervalo, IA de texto/imagem) é executada sozinha por um worker em segundo plano, publicando artigos no intervalo definido até ser pausada ou atingir um máximo opcional.

Todo o histórico de artigos fica registrado (Histórico), com reenvio para artigos que falharam. O app está em produção real (não é só um protótipo): há linhas de produção ativas publicando de fato em sites WordPress reais desde 2026-08-24, com pelo menos dois incidentes de produção já registrados e corrigidos (seção 8).

Fonte: `PRD-Wordbee-Clone.md` §1; `README.md`.

---

## 2. Arquitetura real (atual, não a do PRD)

### 2.1 Diagrama do fluxo em produção

```
┌─────────────────┐        escreve status/nextRunAt        ┌──────────────────┐
│   Vercel (web)   │ ───────────────────────────────────▶  │  Postgres (Neon)  │
│   Next.js 14     │                                        │  (gerenciado,     │
│   serverless     │ ◀─────────────────────────────────── │   externo, único   │
└────────┬─────────┘        lê dados (dashboard, etc.)      │   para web+worker) │
         │                                                  └─────────▲──────────┘
         │ rate limit de login,                                       │ polling a cada
         │ heartbeat do worker                                        │ ~90s (FOR UPDATE
         ▼                                                            │ SKIP LOCKED)
┌──────────────────┐    semáforo provider-slot:<provider>    ┌────────┴──────────┐
│  Redis (Upstash)  │ ◀───────────────────────────────────  │  Worker (EasyPanel) │
│  (gerenciado,      │      (concorrência de chamadas de IA)  │  Docker, processo    │
│   externo, único   │ ───────────────────────────────────▶  │  always-on,           │
│   para web+worker)  │                                        │  cron+Postgres        │
└──────────────────┘                                        └────────┬──────────┘
                                                                       │ IA (OpenRouter/
                                                                       │ OpenAI/Gemini/…)
                                                                       │ + REST API
                                                                       ▼
                                                              ┌──────────────────┐
                                                              │   WordPress(es)    │
                                                              │   (sites do dono)   │
                                                              └──────────────────┘
```

Dois ambientes de deploy **independentes** (Vercel e EasyPanel), coordenados só por compartilharem literalmente a mesma `DATABASE_URL` e a mesma `REDIS_URL`. Não há orquestração nem deploy único.

Fonte: `README.md` (seção "Deploy: EasyPanel + Neon + Upstash"); `DECISIONS.md` "Estado final da infraestrutura de produção — Railway descontinuada" (2026-08-25).

### 2.2 Por que o agendamento não usa mais BullMQ/Redis

Até 2026-08-30 o agendamento das Linhas de Produção era feito via fila BullMQ sobre Redis (job com `jobId=lineId`, delay = próximo `nextRunAt`). Esse desenho foi **substituído por completo** por polling cron+Postgres (`apps/worker/src/line-scheduler.ts` + `apps/worker/src/postgres-line-lock.ts`):

- **Motivo real**: o `Worker` do BullMQ mantém uma conexão bloqueante (`BZPOPMIN`) que a própria lib limita a blocos de 10s (constante interna, não configurável) — isso gerava ~260 mil comandos Redis/mês (~52% do consumo total medido) só de long-poll ocioso, mesmo com o próximo job agendado para horas depois. O plano gratuito do Upstash (500 mil comandos/mês) foi atingido 100% em 2026-08-29 por esse motivo, não por volume real de geração de artigo (que era baixo: só 2 linhas ativas na época, intervalos de 12–24h).
- **Solução**: `apps/worker/src/line-scheduler.ts` roda um `setInterval` (padrão `SCHEDULER_INTERVAL_MS=90000`, 90s) que chama `claimDueLines` — uma única query `WITH ... FOR UPDATE SKIP LOCKED` seguida de `UPDATE ... RETURNING` que reivindica atomicamente até `WORKER_CONCURRENCY` (padrão 5) linhas `ATIVA` com `nextRunAt` vencido, gravando `locked_at`/`locked_by` na mesma instrução SQL. Isso substitui tanto o `SET NX` de lock por linha no Redis quanto a fila em si.
- **Trade-off aceito**: latência de disparo passou de "segundos" (delay do job BullMQ) para até ~90s–2min (intervalo do tick) — irrelevante dado que os intervalos reais das linhas vão de 10min a 24h.

Fonte: `DECISIONS.md` "Scheduler cron+Postgres — substituição do BullMQ always-on" (2026-08-30); `apps/worker/src/line-scheduler.ts`; `apps/worker/src/postgres-line-lock.ts`.

### 2.3 Para que o Redis ainda é usado

Redis (Upstash) **não desapareceu** — continua em uso para três coisas, todas leves:

1. **Semáforo de concorrência por provedor de IA** (`provider-slot:<provider>`, ex. `provider-slot:openrouter`) — limita quantas chamadas simultâneas de IA por provedor rodam entre todas as linhas ativas (`AI_PROVIDER_CONCURRENCY`, padrão 3), via um script Lua atômico (`apps/worker/src/provider-concurrency.ts`). Deliberadamente **não** foi movido para o Postgres na migração do scheduler — o volume desse semáforo é proporcional ao volume real de chamadas de IA (não um custo de fundo constante como era o `BZPOPMIN`), e mover para Postgres trocaria round-trips baratos de Redis por round-trips mais caros de Postgres sem ganho líquido. **Escopo confirmado por leitura de código (2026-08-31)**: esse semáforo protege só as Linhas de Produção, processadas pelo worker (`apps/worker/src/line-pipeline.ts`) — a geração unitária ("Criar Artigo", `apps/web/src/lib/article-pipeline.ts`) chama `textProvider`/`imageProvider` diretamente, sem passar por ele (o módulo `provider-concurrency.ts` só existe em `apps/worker`, não em `@wordbee/shared`, então nem poderia ser importado do web sem um import cross-package deliberado). Isso é escopo intencional — RF-30 do PRD fala do "agendador" limitando concorrência entre linhas, nunca da geração unitária síncrona (que nunca tem concorrência interna possível) — não uma lacuna. Ver seção 7.2 e `DECISIONS.md` "Esclarecimento de escopo do semáforo..." (2026-08-31).
2. **Rate limit de login** (`login:<ip>`, só o processo web usa).
3. **Heartbeat de saúde do worker** (`worker:heartbeat`, TTL 90s, gravado a cada 60s; `worker:last_success`) — alimenta o badge "Worker online/offline" do Dashboard.

Fonte: `DECISIONS.md` "Scheduler cron+Postgres" e "Investigação de consumo de comandos Redis" (2026-08-29); `apps/worker/src/provider-concurrency.ts`; `packages/shared/src/worker-health.ts`.

### 2.4 Restrição de IP dinâmico da Vercel

A Vercel roda o web como funções serverless com **IP de saída dinâmico** — não há como restringir com segurança um banco/Redis só para o(s) IP(s) da Vercel via allowlist de firewall, e deixar a porta aberta para qualquer IP de origem é um risco desnecessário. Por isso Postgres e Redis **precisam** ser serviços com endpoint público + TLS pensados para esse padrão (Neon e Upstash, respectivamente) em vez de rodarem dentro da rede privada do EasyPanel. Consequência prática: `DATABASE_URL` e `REDIS_URL` do web (Vercel) e do worker (EasyPanel) precisam ser **literalmente o mesmo valor** — não duas instâncias equivalentes, o mesmo texto de connection string. Já houve um incidente real de divergência (seção 8).

Fonte: `README.md` linhas 140–142; `DECISIONS.md` "Redis único via Upstash — causa raiz de linhas de produção não processando" (2026-08-25).

### 2.5 Serviços de infra em uso hoje

| Serviço | Papel | Observação |
|---|---|---|
| **Vercel** | Hospeda o app web (Next.js serverless) | Único ambiente do "web" |
| **EasyPanel** (VPS próprio) | Hospeda o worker, como serviço "App" Docker único | Sem Postgres/Redis locais — zero serviços com estado no VPS |
| **Neon** | Postgres gerenciado | Único banco, compartilhado por web e worker |
| **Upstash** | Redis gerenciado | Único Redis, compartilhado por web e worker (uso reduzido — seção 2.3) |
| **GitHub** | Hospeda o repositório; fonte do deploy do worker no EasyPanel (Source = GitHub) e, presumivelmente, do deploy da Vercel | Confirmado como fonte de deploy no README; integração Vercel↔GitHub não documentada em arquivo, mas é o padrão da plataforma |

**Railway confirmada como totalmente removida.** Busca por `railway` (case-insensitive) em todo o repositório (excluindo `node_modules`/`.git`) encontra menções só em: `PRD-Wordbee-Clone.md` (texto original do PRD, histórico), `README.md`/`DECISIONS.md`/`PROGRESS.md` (registro histórico explícito de que Railway foi descontinuada), `docker-compose.prod.yml` (comentário referenciando a decisão histórica), `apps/web/next.config.mjs` (comentário) e `apps/web/src/app/api/articles/generate/route.ts` (comentário sobre `maxDuration` não ter efeito fora da Vercel). **Nenhuma** menção é configuração ativa, variável de ambiente ou código que dependa de Railway — são todos comentários/documentação de contexto histórico. `.env.example`/`.env.production.example`/`VERCEL-ENV.md` não citam Railway.

Fonte: grep `railway` no repo (2026-08-31); `DECISIONS.md` "Estado final da infraestrutura de produção — Railway descontinuada" (2026-08-25).

---

## 3. Estrutura do monorepo

npm workspaces, 4 pacotes:

```
apps/
  web/                  Next.js 14 (App Router) — painel + API routes, deploy na Vercel
    src/app/
      (dashboard)/      Rotas autenticadas do painel: dashboard, chaves-de-api,
                         sites-wordpress, criar-artigo, linhas-de-producao, historico, perfil
      api/               Todas as API routes (auth, api-keys, wp-sites, production-lines,
                         articles, profile, uploads)
      login/             Tela de login (única rota pública além de /api/auth/login)
    src/components/      Componentes React por área (production-lines/, historico/, criar-artigo/, ui/)
    src/lib/             Lógica de servidor: auth.ts, api-keys.ts, wp-sites.ts,
                         production-lines.ts, article-pipeline.ts, rate-limit.ts, validators.ts
  worker/                 Processo Node.js always-on — scheduler cron+Postgres, deploy no EasyPanel
    src/
      index.ts           Bootstrap: conecta Redis/Postgres, heartbeat, inicia o scheduler
      line-scheduler.ts   Loop do cron (setInterval + guarda contra sobreposição de tick)
      postgres-line-lock.ts  Reivindicação atômica de linhas devidas (FOR UPDATE SKIP LOCKED)
      line-pipeline.ts    Lógica de negócio de um "tick" de linha (retry, rate limit, idempotência)
      provider-concurrency.ts  Semáforo Redis por provedor de IA (script Lua)
      heartbeat-log.ts    Log periódico estruturado de saúde do worker
      api-keys.ts, wp-sites.ts  Leitura/descriptografia server-side (versão do worker)
packages/
  db/                    Prisma: schema.prisma, migrations/, seed.ts, client compartilhado
  shared/                Código compartilhado entre web e worker
    src/ai/               5 provedores de IA (OpenAI/Gemini/Grok/Stability/OpenRouter) + registry + erros
    src/wordpress/        Cliente REST do WordPress + guarda anti-SSRF
    src/storage/           Abstração de storage (só driver local implementado)
    src/prompts/           Prompts por tipo de artigo (14 tipos)
    src/*.ts (raiz)        Criptografia AES-256-GCM, sessão JWT, senha (Argon2), TOTP, slugify,
                           redis-metrics, worker-health
scripts/                  backup.sh, restore.sh, retire-bullmq-line-queue.mjs (limpeza pós-migração)
storage/uploads/           Diretório físico do driver de storage local (dev/EasyPanel)
```

### 3.1 Scripts npm (raiz do monorepo)

| Script | O que faz |
|---|---|
| `dev` | `build:libs` + sobe o web em modo dev (`npm -w apps/web run dev`) |
| `dev:worker` | `build:libs` + sobe o worker em modo dev |
| `build:libs` | Gera o Prisma Client e builda `packages/shared`/`packages/db` para `dist/` |
| `build` | `build:libs` + build de produção do web e do worker |
| `test` | Gera Prisma Client + roda toda a suíte Vitest |
| `test:watch` | Vitest em modo watch |
| `lint` | Lint do web e do worker (ESLint) |
| `typecheck` | Checagem de tipos de todo o monorepo (`tsc --noEmit` em cada pacote) |
| `db:generate` / `db:migrate` / `db:migrate:deploy` / `db:seed` / `db:studio` | Wrappers para os scripts equivalentes de `packages/db` |

Cada workspace (`apps/web`, `apps/worker`, `packages/shared`, `packages/db`) tem seus próprios scripts `build`/`typecheck`, e `apps/web`/`apps/worker` têm `dev`/`lint`. `apps/web/package.json`'s `build` é autossuficiente (`cd ../.. && npm run build:libs && cd apps/web && next build`) para funcionar independente de onde a plataforma de deploy invoca `npm run build` — bug real de deploy na Vercel corrigido em 2026-08-24 (seção 8).

Fonte: `package.json` (raiz e de cada workspace); `DECISIONS.md` "Deploy na Vercel — correção do build do monorepo".

---

## 4. Modelo de dados atual

Schema completo em `packages/db/prisma/schema.prisma`. Comentário no topo do arquivo: "uso pessoal, usuário único — `user_id` é mantido nas tabelas por higiene de schema, mas o sistema opera com um único registro em `users`."

### 4.1 Tabelas

**`users`** — 1 registro esperado.
`id`, `nome`, `email` (único), `senhaHash`, `temaUi` (default "light"), `totpSecret?`, `totpEnabled` (default false), `createdAt`, `updatedAt`.

**`sessions`** — sessões de login ativas/revogadas (tela Perfil → "sessões ativas").
`id`, `userId`, `tokenHash` (único — hash do sessionId, não do JWT bruto), `userAgent?`, `ip?`, `createdAt`, `lastSeenAt`, `expiresAt`, `revokedAt?`. Índice em `userId`.

**`api_keys`** — chaves de IA cadastradas (BYOK), criptografadas.
`id`, `userId`, `provider` (enum `AiProvider`), `tipo` (enum `ApiKeyKind`: TEXTO/IMAGEM/AMBOS), `chaveEncrypted`, `iv`, `authTag` (AES-256-GCM), `maskedHint`, `statusValidacao` (default false), `lastValidatedAt?`, `lastError?`, `createdAt`, `updatedAt`. Constraint única `(userId, provider, tipo)` — é o que permite uma única linha "AMBOS" servir texto e imagem para provedores de chave compartilhada.

**`wp_sites`** — sites WordPress cadastrados.
`id`, `userId`, `nome`, `url`, `usuario`, `appPasswordEncrypted`, `iv`, `authTag`, `lastTestAt?`, `lastTestOk?`, `lastTestError?`, `createdAt`, `updatedAt`. Índice em `userId`.

**`production_lines`** — linhas de produção (automação).
`id`, `userId`, `wpSiteId`, `nome`, `categoriaWpId?`, `categoriaWpNome?`, `iaTexto`/`iaImagem` (enum `AiProvider`), `tipoArtigo` (enum `ArticleType`, 14 valores), `temas` (`String[]`), `intervaloMin`, `maxArtigos?`, `geradosCount` (default 0), `statusWp` (enum `WpPostStatus`, default PUBLISH), `promptCustomizado?`, `status` (enum `LineStatus`: ATIVA/PAUSADA/CONCLUIDA, default ATIVA), `pauseReason?`, `rateLimitBehavior` (enum `RateLimitBehavior`: ADIAR/PAUSAR, default ADIAR), `consecutiveFailures` (default 0), `nextRunAt?`, `lastRunAt?`, **`lockedAt?`, `lockedBy?`** (adicionados pós-PRD, migração `20260830120000` — lock de execução do scheduler cron+Postgres; `lockedAt` nulo = linha livre, não-nulo = alguma instância do worker está processando ou travou processando; `lockedBy` só para depuração, nenhuma lógica de lock depende dele), `createdAt`, `updatedAt`. Índices: `(nextRunAt, status)` e `userId`.

**`line_reference_images`** — imagens de referência por linha (máx. 5, validado na aplicação).
`id`, `lineId`, `storageUrl`, `ordem`, `createdAt`. Índice em `lineId`.

**`title_queue`** — fila de títulos por linha.
`id`, `lineId`, `titulo`, `previstoPara`, `status` (enum `TitleStatus`: NA_FILA/USADO/DESCARTADO, default NA_FILA), `createdAt`, `updatedAt`. Índice em `(lineId, status)`.

**`articles`** — histórico de artigos (manuais e de linha).
`id`, `userId`, `lineId?`, `titleQueueId?` (único), `wpSiteId`, `titulo`, `tema?`, `tipo`, `origem` (enum `ArticleOrigin`: MANUAL/LINHA), `promptCustomizado?`, `iaTexto?`/`iaImagem?`, `categoriaWpId?`, `wpStatusAlvo` (default PUBLISH), `status` (enum `ArticleStatus`: PROCESSANDO/PUBLICADO/RASCUNHO/FALHA, default PROCESSANDO), `contentHtml?`, `excerpt?`, `slug?`, `imageUrl?`, `wpMediaId?`, `wpPostId?`, `wpUrl?`, `erroMsg?`, `idempotencyKey?` (único — `line:{lineId}:title:{titleQueueItemId}` ou `line:{lineId}:adhoc:{timestamp}`), `createdAt`, `updatedAt`, `publishedAt?`. Os campos `wpMediaId`, `iaTexto`, `iaImagem`, `categoriaWpId`, `wpStatusAlvo`, `tema`, `promptCustomizado` **não estão no modelo de dados do PRD original (§5)** — foram adicionados em 4 migrações pequenas no PROMPT 3 para viabilizar retry parcial (reenviar um artigo sem regerar conteúdo/imagem já gerados). Índices: `createdAt`, `(lineId, createdAt)`, `(userId, status)`.

### 4.2 Migrations aplicadas

| Migration | Data (do nome, UTC) | Conteúdo |
|---|---|---|
| `20260824035722_init` | 2026-08-24 03:57 | Schema inicial completo |
| `20260824130351_add_article_wp_media_id` | 2026-08-24 13:03 | `articles.wp_media_id` |
| `20260824130522_add_article_provider_and_category` | 2026-08-24 13:05 | `articles.ia_texto`/`ia_imagem`/`categoria_wp_id` |
| `20260824130617_add_article_wp_status_alvo` | 2026-08-24 13:06 | `articles.wp_status_alvo` |
| `20260824130652_add_article_tema_and_prompt` | 2026-08-24 13:06 | `articles.tema`/`prompt_customizado` |
| `20260825105312_add_openrouter_provider` | 2026-08-25 10:53 | Adiciona `OPENROUTER` ao enum `AiProvider` |
| `20260830120000_add_production_line_lock_columns` | 2026-08-30 12:00 | `production_lines.locked_at`/`locked_by` |

**Todas as 7 migrations estão confirmadas aplicadas em produção (Neon)** — mas só depois de um incidente real: a última (`20260830120000`) foi deployada em código antes de ser aplicada em produção, causando um `P2022` em produção por ~9h até ser corrigida manualmente (`prisma migrate deploy` rodado direto contra o Neon de produção). Ver seção 8 para o incidente completo. Não há migration no repositório sem correspondência aplicada **no momento em que este documento foi escrito** — mas o processo de deploy não garante isso automaticamente (seção 9), então essa afirmação vale para o instante da checagem, não como garantia permanente.

Fonte: `packages/db/prisma/schema.prisma`; `packages/db/prisma/migrations/`; `DECISIONS.md` "Incidente: migração do scheduler cron+Postgres deployada em código sem a migração de schema correspondente" (2026-08-30).

---

## 5. O que está implementado e funcionando em produção

### Auth
Login e-mail+senha (`POST /api/auth/login`) com hash Argon2id (`@node-rs/argon2`). Sessão via JWT HS256 (`jose`) **e** registro em `sessions` no Postgres — validação dupla (JWT assinado + sessão não revogada/expirada no banco), não confia só no token. TOTP/2FA real (otplib + QR code): setup (`POST /api/auth/totp/setup`), confirmação (`verify`), desativação exigindo senha (`disable`); login exige `totpCode` se `totpEnabled=true`, sem gerar 401 antes disso (`{requiresTotp:true}`). Rate limit de login via Redis (`login:<ip>`, padrão 5 tentativas/15min). Perfil: troca de nome/senha (troca de senha revoga todas as outras sessões), listagem e encerramento individual de sessões ativas. Logout revoga a sessão atual. **Funcionando em produção, sem lacunas identificadas.**

### Dashboard
Server Component puro (sem polling client-side) — 100% dados reais via Prisma: total publicados, publicados no mês, sites cadastrados, títulos agendados nas próximas 24h, linhas ativas, últimos 5 artigos, alerta visual de linhas pausadas por 5+ falhas consecutivas. Badge "Worker online/offline" via heartbeat Redis (TTL 90s). **Funcionando em produção.**

### Chaves de API
CRUD completo. Criptografia AES-256-GCM (`packages/shared/src/crypto.ts`), IV por chamada, `authTag` verificado no decrypt. Validação real contra o provedor **antes** de persistir (RF-15) — chave inválida nunca é salva. Compartilhamento OpenAI/Gemini/OpenRouter (`tipo=AMBOS`); Grok/Stability separadas. Remoção é hard delete, idempotente. **Funcionando em produção.**

### Sites WordPress
CRUD completo, senha de aplicação criptografada com o mesmo AES-256-GCM. Teste de conexão real (`GET /wp-json/wp/v2/users/me?context=edit`, exige role administrador). Categorias carregadas dinamicamente via REST. Exclusão bloqueada (409) se houver linha de produção usando o site. **Funcionando em produção.**

### Criar Artigo (unitário/manual)
Pipeline real ponta a ponta: título (sugerido por IA ou informado) → conteúdo HTML → imagem → upload de mídia no WP → criação do post, com progresso transmitido em NDJSON (não SSE) para a tela. Reenvio de artigo com falha reaproveita o que já foi gerado. **Não inclui imagens de referência** (RF-21 não cobre isso — é exclusivo das Linhas de Produção, decisão explícita registrada em `DECISIONS.md` PROMPT 2). **Funcionando em produção**, com uma limitação de ambiente: no plano Hobby da Vercel, o timeout de 10–60s da função serverless pode cortar gerações demoradas mesmo com `maxDuration=300` no código (só planos Pro/Enterprise com Fluid Compute respeitam os 300s) — documentado em `VERCEL-ENV.md`. ⚠ verificar com Rafael o plano atual da Vercel em uso.

### Linhas de Produção
- **Criar**: ✅ implementado (`POST /api/production-lines`).
- **Pausar/Retomar**: ✅ implementado (`PATCH .../[id]` com `action:"pause"|"resume"`). Retomar zera `consecutiveFailures` e recalcula `nextRunAt=now()`; bloqueia se `maxArtigos` já foi atingido.
- **Editar**: ❌ **não implementado**. Não existe endpoint nem UI para editar uma linha já criada (nome, temas, intervalo, IA, categoria, prompt, comportamento de rate limit). Único `PATCH` existente é pause/resume. Isso não é uma regressão em relação ao PRD — o PRD (RF-26) também só lista Pausar/Retomar/Excluir como ações do card, sem mencionar edição — mas é uma lacuna funcional real: mudar qualquer parâmetro de uma linha ativa hoje exige excluir e recriar.
- **Excluir**: ✅ implementado (`DELETE`, hard delete com cascade no schema).
- **Fila de títulos**: ✅ geração sob demanda (`POST .../titles`, evita duplicar título já publicado/na fila), edição de item individual antes de consumido (`PATCH .../titles/[titleId]`, só para itens `NA_FILA`). Reposição automática após cada publicação, se a fila tiver menos de 3 pendentes.
- **Imagens de referência (máx. 5)**: ✅ upload/listagem/remoção implementados (`POST`/`GET`/`DELETE .../reference-images`), validação de mimetype (png/jpeg/webp) e tamanho (≤5MB). Carregadas e enviadas ao provedor de imagem sempre que ele declara suporte (`IMAGE_PROVIDERS[...].suportaImagensReferencia === true` em `packages/shared/src/ai/registry.ts`, hoje GEMINI e OPENROUTER) — `apps/worker/src/line-pipeline.ts` (`providerSupportsReferenceImages`) consulta essa flag em vez de checar o nome do provedor. **Corrigido em 2026-08-31**: antes só funcionava com `iaImagem === "GEMINI"` hardcoded; linhas com `iaImagem=OPENROUTER` (o provedor efetivamente em uso hoje) tinham as imagens salvas mas nunca enviadas — bug real, achado na auditoria e corrigido com TDD (`apps/worker/src/line-pipeline.test.ts`, 3 testes novos; evidência de ponta a ponta até o payload HTTP real do OpenRouter em `packages/shared/src/ai/openrouter.test.ts:244-259`). **Impacto histórico real confirmado**: query rodada manualmente por Rafael via `psql` contra o Postgres de produção (Neon), fora de uma sessão do Claude Code, retornou `0 rows` — nenhuma linha de produção com `ia_imagem != 'GEMINI'` tinha imagens de referência cadastradas. **0 linhas reais afetadas**: o bug existia no código, mas sem vítima real em produção. Ver seção 8, item 17; `DECISIONS.md` "Dois bugs reais encontrados na auditoria de PROJECT-STATE.md, corrigidos com TDD" (2026-08-31).
- **Agendamento (nextRunAt)**: ✅ cron+Postgres (seção 2.2).
- **consecutiveFailures**: ✅ incrementado a cada falha determinística, zerado em toda execução com sucesso; ao atingir 5, a linha é pausada automaticamente com `pauseReason` descritivo.
- **Comportamento de rate limit (ADIAR/PAUSAR)**: ✅ `ADIAR` (padrão) não conta como falha, só adia o próximo disparo em 15min fixos; `PAUSAR` pausa a linha imediatamente.
- **Lock (lockedAt/lockedBy)**: ✅ implementado via Postgres `FOR UPDATE SKIP LOCKED` (seção 2.2), com recuperação automática de lock morto após 20min (`LINE_LOCK_STALE_MS`).
- **Retry**: ✅ até 3 tentativas por tick, backoff exponencial (1s·2^tentativa), com releitura do artigo a cada tentativa para não regerar conteúdo/imagem já persistidos.
- **Idempotência**: ✅ via `idempotencyKey` determinística por artigo.

### Histórico
Listagem paginada (20/página) via Prisma direto (Server Component + querystring), filtros por site, status, linha (ou "manual"), período (`de`/`ate`) e busca por título (case-insensitive). Reenvio (`POST /api/articles/[id]/resend`) só para artigos `FALHA`, reaproveitando conteúdo/imagem já gerados. **Funcionando em produção, sem lacunas identificadas.**

---

## 6. Divergências em relação ao PRD original

| Divergência | PRD original | Estado atual | Motivo documentado |
|---|---|---|---|
| Scheduler de Linhas de Produção | §7: "Redis + BullMQ (repeatable jobs por linha)" | Cron+Postgres (`setInterval` + `FOR UPDATE SKIP LOCKED`), sem BullMQ | Custo de comandos Redis do long-poll always-on do BullMQ (~260 mil/mês, esgotou o free tier do Upstash) — `DECISIONS.md` 2026-08-29/30 |
| Infra sugerida | §7: "Vercel (front) + 1 worker (Railway/Fly) — ou tudo em um VPS único" | Vercel (web) + EasyPanel/VPS próprio (worker) + Neon (Postgres) + Upstash (Redis), 4 serviços coordenados | Railway teve bugs de deploy (`output:standalone` incompatível) e foi descontinuada por decisão de migração para VPS próprio; Postgres/Redis viraram gerenciados externos por causa do IP dinâmico da Vercel (seção 2.4) |
| Banco (storage) | §7: "PostgreSQL (Supabase ou equivalente)" | Neon | Escolha de provedor gerenciado com endpoint público/TLS nativo, compatível com IP dinâmico da Vercel |
| Storage de imagens | §7: "S3-compatível (ou Supabase Storage)" | Só disco local implementado (`STORAGE_DRIVER=local`); `S3` existe como opção de env mas **lança erro em runtime** — nunca foi implementado | Abstração (`StorageDriver`) existe pronta para trocar, mas a implementação S3 nunca foi escrita. Efeito prático: imagens de referência não funcionam de forma confiável no deploy dividido atual (Vercel efêmera + worker em outro host) — documentado explicitamente como aviso em `VERCEL-ENV.md` |
| Provedores de IA | §1.2/§3.3: OpenAI, Gemini, xAI (Grok), Stability AI | Os 4 originais **continuam implementados e selecionáveis**, mais um 5º — **OpenRouter** (texto: DeepSeek V4 Flash; imagem: Gemini 2.5 Flash Image / "Nano Banana") | OpenRouter foi adicionado em 2026-08-25 como alternativa de pagamento (DeepSeek direto exige cartão internacional; Gemini direto tinha cota gratuita de imagem já esgotada em testes) — não é substituição, é adição |
| Modelo de texto do Gemini | PRD cita "Gemini 2.5 Flash" | Código usa `gemini-3.6-flash` (default) | O modelo citado no PRD já não existe mais para novas chaves — API retorna 404 recomendando o novo. `GEMINI_TEXT_MODEL` configurável via env |
| Nome comercial "Grok Imagine" | RF-11 | Mapeado internamente para o model id `grok-2-image` | Nomenclatura comercial ≠ model id da API — já houve troca de nome no passado, por isso configurável via env |
| Modelo de dados (`articles`) | §5: campos básicos (id, line_id?, wp_site_id, titulo, tipo, status, wp_post_id, wp_url, erro_msg, created_at, published_at) | Ganhou `wp_media_id`, `ia_texto`, `ia_imagem`, `categoria_wp_id`, `wp_status_alvo`, `tema`, `prompt_customizado` | Necessários para retry parcial (reenviar sem regerar) — RF-29/RF-32 do próprio PRD exigem isso, mas o PRD não detalhou os campos |
| Edição de Linha de Produção | Não mencionado explicitamente no PRD (RF-26 só lista Pausar/Retomar/Excluir) | Não implementado | Consistente com o PRD (que nunca pediu edição), mas é uma lacuna funcional real na prática — única forma de mudar parâmetros é excluir e recriar |
| Backend sugerido | §7: "Node.js (NestJS ou Fastify)" | Next.js API routes (App Router) para o web + processo Node.js puro para o worker | Nenhuma decisão registrada especificamente sobre isso — Next.js já cobre frontend+backend do "web" (decisão implícita desde o PROMPT 1) |

Fonte: comparação direta `PRD-Wordbee-Clone.md` vs. código/schema/`DECISIONS.md`.

---

## 7. Provedor de IA

### 7.1 OpenRouter é o único configurado hoje, mas a abstração multi-provedor está viva

`packages/shared/src/ai/` tem implementações completas e reais (não mockadas) para os **5 provedores**: `openai.ts`, `gemini.ts`, `grok.ts`, `stability.ts`, `openrouter.ts` — cada um com `createTextProvider`/`createImageProvider`/validação de chave, chamando os endpoints reais de cada API. `registry.ts` lista todos os 5 (`TEXT_PROVIDERS`: OpenAI, Gemini, Grok, OpenRouter; `IMAGE_PROVIDERS`: OpenAI, Gemini, Grok, Stability, OpenRouter) e alimenta dinamicamente os selects da UI (Criar Artigo, Nova Linha, Chaves de API) — nenhum select é hardcoded para um provedor específico.

O que é verdade é que, **operacionalmente**, os incidentes e ajustes de produção registrados em `DECISIONS.md` desde 2026-08-25 giram quase exclusivamente em torno do OpenRouter (chave `provider-slot:openrouter` no Redis, timeouts de streaming do OpenRouter, etc.) — indício forte de que é o único provedor com chave cadastrada em produção hoje, mas isso é **estado de dados do usuário** (quais chaves foram cadastradas via UI), não algo confirmável lendo só o código. **⚠ verificar com Rafael** quantas/quais chaves de provedor estão de fato cadastradas na tabela `api_keys` de produção agora.

A abstração multi-provedor do PRD original **não está morta nem foi removida** — está implementada, testada (`openrouter.test.ts`, `errors.test.ts`, etc.) e pronta para uso assim que uma chave de outro provedor for cadastrada pela UI.

### 7.2 Mecanismo de concorrência (semáforo)

**Escopo: só Linhas de Produção, via worker — não a geração unitária.** Confirmado por leitura de código (`grep` por `withProviderSlot`/`acquireProviderSlot`/`releaseProviderSlot` em todo o monorepo): essas funções só existem em `apps/worker/src/provider-concurrency.ts` e só são chamadas a partir de `apps/worker/src/line-pipeline.ts`. `apps/web/src/lib/article-pipeline.ts` ("Criar Artigo", geração unitária) chama os providers de IA diretamente, sem esse wrapper — por design (RF-30 do PRD é sobre o agendador de linhas, não sobre a geração unitária síncrona), não por lacuna. Ver `DECISIONS.md` (2026-08-31).

Chave Redis: **`provider-slot:<provider>`** (provider em minúsculo, ex. `provider-slot:openrouter`), TTL 300s (`SLOT_TTL_SECONDS`). Aquisição via script Lua atômico (`apps/worker/src/provider-concurrency.ts`, `TRY_ACQUIRE_SCRIPT`): `INCR` sempre, `EXPIRE` só na primeira vez que a chave é criada (`count===1`), `DECR` de volta se `count` passar do limite (`AI_PROVIDER_CONCURRENCY`, padrão 3) — tudo em 1 round-trip Redis. Se não conseguir vaga, espera com poll (800ms + jitter até 800ms) e tenta de novo, indefinidamente (não há timeout de espera).

**Liberação (`finally` de `withProviderSlot`, `releaseProviderSlot`)**: **corrigido em 2026-08-31.** Antes era um `redis.decr(key)` simples sem `EXPIRE`, divergindo do que `DECISIONS.md` (2026-08-29) já descrevia como corrigido — reabria o mesmo bug (contador negativo, sem TTL) se uma chamada de IA durasse mais que `SLOT_TTL_SECONDS`. Agora a liberação também é um script Lua atômico (`RELEASE_SCRIPT`): `DECR` com clamp em 0 (nunca fica negativo, mesmo com liberações duplicadas) e `EXPIRE` sempre renovado, mesmo partindo de uma chave já expirada/ausente. Coberto por `apps/worker/src/provider-concurrency.integration.test.ts` (5 testes, Redis real efêmero — inclusive o cenário exato do bug de 2026-08-29, reproduzido e confirmado vermelho contra o código anterior antes da correção). **Validado depois contra o Redis de produção real** (não só em teste isolado): a chave `provider-slot:openrouter` estava de fato vazada (`-1`/sem TTL, o vazamento antigo de 2026-08-29 nunca autocorrigido); um ciclo real de acquire+release forçado contra essa chave confirmou a autocorreção do código corrigido (`-1`/sem TTL → `0`/TTL 300). Ver seção 8, itens 18 e 19.

**Observação de design que ficou como coincidência não-documentada, não resolvida nesta correção**: `SLOT_TTL_SECONDS` (300s) é literalmente igual a `DEFAULT_MAX_TIMEOUT_MS` (5min) do streaming de texto do OpenRouter (`packages/shared/src/ai/http.ts`) — o teto absoluto introduzido em 2026-08-27 para tolerar respostas legítimas lentas. Isso significa que uma chamada de texto no limite do que o sistema tolera como "normal" também é o cenário que mais tensiona o TTL do semáforo. A correção desta seção torna esse cenário seguro (nunca mais fica negativo/sem TTL), mas o valor `300` continua duplicado em dois arquivos por coincidência, não por uma decisão documentada de mantê-los sincronizados — vale uma decisão explícita (constante compartilhada, ou comentário cruzado nos dois arquivos) antes de mexer em qualquer um dos dois números isoladamente. Ver seção 11.

Fonte: `apps/worker/src/provider-concurrency.ts`; `apps/worker/src/provider-concurrency.test.ts`; `apps/worker/src/provider-concurrency.integration.test.ts`; `DECISIONS.md` "Investigação de consumo de comandos Redis" item 5 (2026-08-29) e "Dois bugs reais encontrados na auditoria de PROJECT-STATE.md, corrigidos com TDD" (2026-08-31).

---

## 8. Incidentes e correções já feitas (cronologia real)

1. **2026-08-24 — Bug crítico: `fetch` global do Next.js quebra chamadas HTTP server-to-server.** Respostas de erro HTTP (401/400 de provedores de IA) viravam exceções genéricas em vez de `Response` inspecionável. **Corrigido** importando `fetch` de `undici` explicitamente em vez do global do Next.js (cliente de IA e cliente WordPress).
2. **2026-08-24 — Modelo `gemini-2.5-flash` do PRD já descontinuado.** API retornava 404 para novas chaves. **Corrigido** trocando o default para `gemini-3.6-flash`.
3. **2026-08-25 — Bug de produção: geração de artigo via OpenRouter travava para sempre.** `fetchJsonOrThrow` cancelava o timer de timeout assim que os *headers* da resposta chegavam, deixando a leitura do *corpo* (que podia levar minutos num artigo longo) sem timeout nenhum. **Corrigido** envolvendo `fetch()` e a leitura do corpo no mesmo timer; `DEFAULT_TIMEOUT_MS` subiu de 30s para 60s (a correção expôs que o timeout antigo, na prática, nunca era realmente aplicado).
4. **2026-08-25 — Bug de produção: crash `l.wpSite.nome` ao ativar/pausar linha + 405 no GET de reference-images.** `pauseProductionLine`/`resumeProductionLine`/`createProductionLine` não incluíam `wpSite` no retorno do Prisma, quebrando um contrato de tipo que o frontend assumia como obrigatório. **Corrigido** com um `include` compartilhado (`WP_SITE_INCLUDE`) nas 3 funções, mais guardas defensivas (`?? "—"`) no frontend. `GET` de reference-images (só existia `POST`) foi adicionado por paridade.
5. **2026-08-25 — Deploy do web na Railway quebrava (`"next start" does not work with "output: standalone"`).** `output:"standalone"` só era desativado para `process.env.VERCEL`, não para a Railway. **Corrigido** removendo `output:"standalone"` por completo do `next.config.mjs` (nem Vercel nem Railway usam esse modo) — efeito colateral aceito: `apps/web/Dockerfile` ficou obsoleto (marcado como tal, não removido).
6. **2026-08-25 — Build na Vercel falhava (`Module not found: @wordbee/db`).** A Vercel roda `npm run build` só de dentro de `apps/web` (Root Directory), pulando o `build:libs` da raiz. **Corrigido** tornando o `build` de `apps/web/package.json` autossuficiente.
7. **2026-08-25 — Redis único via Upstash: linhas de produção paravam de processar pós-migração de infra.** `REDIS_URL` da Vercel e do worker (EasyPanel) apontavam para Redis diferentes — a fila BullMQ só existe dentro de um Redis específico, então o worker nunca via os jobs. **Causa raiz era configuração, não código**; corrigido apontando as duas plataformas para o mesmo Upstash.
8. **2026-08-25 — Migração de infraestrutura Railway → EasyPanel/Neon/Upstash concluída e validada** com teste real de ponta a ponta (linha processada, artigo publicado de verdade).
9. **2026-08-27 — Bug real: reagendamento de linha ATIVA falhava silenciosamente por colisão de `jobId` no BullMQ.** `scheduleLineRun(jobId=lineId)` era chamado de dentro do próprio processor enquanto o job atual (mesmo `jobId`) ainda estava `active` — BullMQ ignora silenciosamente `add()` com `jobId` já existente em qualquer estado, sem lançar erro. **Corrigido** movendo todo o reagendamento para os handlers `completed`/`failed` do BullMQ (onde o `jobId` já está livre).
10. **2026-08-27 — Bug primo: job "failed" morto podia bloquear `cancelLineRun`/`syncActiveLines` para sempre.** Erros fora do try/catch principal (Postgres, descriptografia) propagavam como exceção não tratada, e `cancelLineRun` só removia jobs `waiting`/`delayed` (não `failed`). **Corrigido** em duas frentes: `cancelLineRun` passou a remover job em qualquer estado exceto `active`; `runProductionLine` virou um wrapper que nunca lança (captura tudo internamente).
11. **2026-08-27 — Achado crítico: os dois fixes acima nunca tinham sido commitados/enviados ao GitHub**, então nunca chegaram a ser deployados — o worker em produção rodou o código antigo (com os dois bugs) o dia inteiro após a correção ter sido "feita" localmente. Enviados junto com instrumentação de produção (workerId por processo, logs estruturados) nesta mesma sessão.
12. **2026-08-27 — Timeout fixo → streaming com idle timeout no OpenRouter + jitter no agendamento.** Chamadas de texto batiam o teto fixo (60s/90s) mesmo progredindo normalmente. **Corrigido** com streaming SSE + timeout de inatividade (20s sem novo chunk, teto absoluto de 5min) em vez de teto fixo para a chamada inteira. Jitter de ±10% adicionado ao cálculo de `nextRunAt` para evitar rajadas simultâneas de linhas com o mesmo intervalo.
13. **2026-08-29 — Aviso de limite do Upstash (500 mil comandos/mês) atingido 100%.** Investigação identificou o `BZPOPMIN` do BullMQ (~260 mil/mês) como causa principal (seção 2.2). Reduções de baixo risco implementadas (`stalledInterval`/`lockDuration` do BullMQ, heartbeats menos frequentes, script Lua atômico do semáforo) reduziram o consumo estimado de ~443 mil para ~327 mil/mês — mas a decisão arquitetural de fundo (eliminar o BullMQ) ficou pendente até o item 14.
14. **2026-08-29 — Bug real: contador de semáforo por provedor (`provider-slot:openrouter`) vazado para `-2`, sem TTL.** Causado por `INCR`/`DECR` não-atômicos (um crash entre os dois deixava a chave inconsistente e sem TTL, incapaz de se autocorrigir). **Corrigido** consolidando em script Lua atômico — mas ver ressalva na seção 7.2 sobre a liberação não renovar TTL, hoje.
15. **2026-08-30 — Scheduler cron+Postgres substitui BullMQ always-on por completo** (seção 2.2), eliminando a causa raiz do item 13.
16. **2026-08-30 — Incidente de produção: `P2022` (`production_lines.locked_at` não existe) na página `/linhas-de-producao`.** A migration `20260830120000` (parte da entrega do item 15) foi deployada em código (web + worker) sem ter sido aplicada em produção antes. **Efeito real**: nenhuma linha rodou entre o deploy do worker novo e a correção — mas o impacto medido foi pequeno (~6h21min de atraso numa única das 5 linhas ativas, zero artigos perdidos de fato, já que as outras 4 só tinham próximo disparo previsto para mais tarde de qualquer forma). **Corrigido** rodando `prisma migrate deploy` diretamente contra o Neon de produção. Gerou um checklist de deploy novo (seção 9).
17. **2026-08-31 — Bug real (auditoria): imagens de referência nunca chegavam ao OpenRouter.** `apps/worker/src/line-pipeline.ts` só carregava `referenceImages` do storage quando `iaImagem === "GEMINI"` — resquício de código de quando Gemini era o único provedor de imagem com esse suporte (confirmado em `PROGRESS.md`, PROMPT 3), nunca atualizado depois que o cliente OpenRouter ganhou suporte real a `input_references` (commit `c8950d0`, 2026-08-25). Como OpenRouter é hoje o único provedor com uso ativo confirmado, qualquer linha com imagens de referência cadastradas e `iaImagem=OPENROUTER` tinha essas imagens salvas mas nunca enviadas — falha silenciosa, sem erro, sem log. **Corrigido** trocando a checagem hardcoded pela flag de capacidade `suportaImagensReferencia` do registry (`IMAGE_PROVIDERS`, `packages/shared/src/ai/registry.ts`) — qualquer provedor futuro que declare suporte passa a funcionar sem precisar tocar em `line-pipeline.ts` de novo. Coberto por 3 testes novos escritos vermelhos antes da correção (`line-pipeline.test.ts`); evidência de ponta a ponta até o payload HTTP real (`openrouter.test.ts:244-259`, que já provava que o cliente OpenRouter monta `input_references` corretamente — o elo quebrado era só o pipeline nunca chamá-lo com as imagens). **Impacto histórico real em produção (quantas linhas/artigos afetados) não confirmado** — ⚠ verificar com Rafael (query sugerida em `DECISIONS.md`), classificador de permissão da sessão bloqueou o acesso de leitura direto a produção.
18. **2026-08-31 — Bug real (auditoria): liberação do semáforo `provider-slot:<provider>` reabria o bug de 2026-08-29.** A correção de 2026-08-29 (item 14) só tornou a **aquisição** atômica; a **liberação** continuava um `redis.decr(key)` isolado, sem `EXPIRE`. Não se manifestava no caminho feliz (chave ainda viva quando a liberação roda), só quando uma chamada de IA dura perto de ou mais que `SLOT_TTL_SECONDS` (300s) — que coincide exatamente com o teto absoluto de 5min do streaming OpenRouter (`DEFAULT_MAX_TIMEOUT_MS`, ver seção 7.2). **Corrigido** com um segundo script Lua atômico para a liberação (`DECR` com clamp em 0 + `EXPIRE` sempre renovado, mesmo partindo de chave expirada/ausente). Coberto por 5 testes novos contra Redis real efêmero (`provider-concurrency.integration.test.ts`), incluindo o cenário exato do bug reproduzido e confirmado vermelho antes da correção. **Confirmado depois contra produção real — ver item 19**: a chave já estava de fato vazada (`-1`/sem TTL).
19. **2026-08-31 — Validação real do item 18 contra o Redis de produção, e esclarecimento de escopo do semáforo.** Confirmado por leitura de código que o semáforo `provider-slot:<provider>` só é usado por Linhas de Produção via worker — a geração unitária ("Criar Artigo") nunca passou por ele e não deveria (escopo intencional, RF-30; ver seção 2.3/7.2). Em seguida, um script Node descartável (não commitado, ao final removido) rodou contra o Redis de produção (Upstash) real, chamando o código real `acquireProviderSlot`/`releaseProviderSlot` do build compilado: (1) num slot isolado de teste e num cenário simulado de expiração, acquire+release nunca deixou resíduo (`0`/TTL 300 em todos os casos); (2) a chave real `provider-slot:openrouter` foi lida antes de qualquer alteração — confirmado `-1`/TTL `-1`, exatamente o vazamento antigo do bug de 2026-08-29, nunca autocorrigido porque nada tinha exercitado essa chave desde o deploy (geração unitária não usa o semáforo; Linhas de Produção rodam a cada 12–24h); (3) um ciclo real de acquire+release foi executado contra essa chave real, forçando a autocorreção em vez de esperar até 24h por um disparo natural — resultado `-1`/sem TTL → `0`/TTL 300, confirmando que o código corrigido do item 18 se autocorrige de fato contra o estado real vazado em produção. `npm run typecheck`/lint/`vitest run` (114 testes) seguiram verdes.
20. **2026-08-31 — Incidente: worker travado com `column "locked_at" does not exist` apesar de `prisma migrate status` confirmar "up to date" e a coluna existir de fato no banco.** Encontrado durante a validação em produção do item 19, sem relação com os Bugs A/B (itens 17/18). Duas hipóteses óbvias — "migração não aplicada" e "coluna realmente ausente" — foram descartadas por evidência direta (`prisma migrate status`; consulta a `information_schema.columns`, que confirmou `locked_at`/`locked_by` existindo de fato); erro `42703` em ticks consecutivos do mesmo `workerId` (não um worker fantasma paralelo). Não era repetição do incidente #16 — o schema estava correto e estável havia dias. **Causa mais provável, confiança média-alta (⚠ não prova definitiva)**: `DATABASE_URL` usa o endpoint `-pooler` do Neon (PgBouncer, modo *transaction*) sem `pgbouncer=true`; `packages/db/index.ts` mantém uma única instância de `PrismaClient` de vida longa por processo; `claimDueLines` (`postgres-line-lock.ts`) roda `prisma.$queryRaw` com parâmetros interpolados — protocolo estendido do Postgres (prepared statements server-side) — a cada tick. É configuração de risco documentada pelo próprio Neon/Prisma: PgBouncer em modo transaction pode rotear transações do mesmo cliente lógico para backends físicos diferentes, deixando uma prepared statement presa a uma conexão antiga (potencialmente de antes de uma migração). Restart do container resolveu, de forma consistente com essa hipótese (força `new PrismaClient()`/conexões físicas novas). **Hipótese alternativa em aberto, ⚠ não confirmada**: timing do deploy do EasyPanel (container antigo convivendo com o novo, ou "deploy concluído" reportado antes do processo novo estar de fato pronto) — sem acesso a logs server-side do EasyPanel/Neon nesta sessão para confirmar nem descartar; se confirmada no futuro, reforçaria (não contradiria) a hipótese principal. **Mitigação**: `?pgbouncer=true&connection_limit=10` recomendado em `README.md`/`VERCEL-ENV.md`/`.env.production.example` (só documentação/exemplos — aplicar de fato nos painéis da Vercel/EasyPanel e no `.env` local é ação pendente do usuário, seção 10); novo passo no checklist de deploy (seção 9.1): reiniciar de verdade (botão "Restart", não só redeploy) o container do worker no EasyPanel depois de qualquer migração de schema aplicada em produção.

Fonte: `DECISIONS.md` (integral, incluindo "Dois bugs reais encontrados na auditoria de PROJECT-STATE.md, corrigidos com TDD" e "Esclarecimento de escopo do semáforo + validação real do Bug 1, e investigação do incidente de conexão presa", ambas 2026-08-31); `git log --oneline`; `apps/worker/src/line-pipeline.test.ts`; `apps/worker/src/provider-concurrency.integration.test.ts`.

---

## 9. Processo operacional atual

### 9.1 Checklist de deploy (documentado no README após o incidente #16)

1. Se a mudança inclui migration de schema nova: `cd packages/db && npx prisma migrate deploy` contra o `DATABASE_URL` de produção (Neon) **antes** de deployar código novo — no web (Vercel) e no worker (EasyPanel), nessa ordem.
2. Checar `npx prisma migrate status --schema prisma/schema.prisma` contra produção para confirmar "up to date" **antes** de considerar o deploy concluído — não só depois de ver um erro.
3. Deploy do código: push no GitHub aciona a Vercel (web); o worker no EasyPanel pode estar configurado com deploy automático no push **ou** exigir redeploy manual pelo botão do painel — ⚠ **verificar com Rafael qual das duas opções está ativa hoje** (não há confirmação em nenhum arquivo do repo; `PROGRESS.md` registra explicitamente, em 2026-08-25, que isso "não foi verificado remotamente, sem acesso ao EasyPanel").
4. **(novo, 2026-08-31) Depois de qualquer migração de schema aplicada em produção, reiniciar de verdade o container do worker no EasyPanel** (botão "Restart", não só redeploy/deploy automático do passo 3) antes de considerar o deploy concluído. Motivado pelo incidente de conexão presa do worker (seção 8, item 20): uma instância de `PrismaClient` de vida longa pode manter uma prepared statement presa a uma conexão física reciclada pelo pooler do Neon mesmo com o schema já correto — um restart força conexões novas do zero. Recomendado complementar com `?pgbouncer=true&connection_limit=10` no `DATABASE_URL` que aponta pro endpoint `-pooler` do Neon (documentado em `README.md`/`VERCEL-ENV.md`/`.env.production.example` — aplicar de fato nos painéis da Vercel e do EasyPanel é ação pendente do usuário, seção 10).

Justificativa da ordem (migration antes do código): colunas novas *nullable* são seguras de adicionar enquanto código antigo ainda roda (ele ignora); o inverso — código novo esperando uma coluna que ainda não existe — não é seguro, e foi exatamente a causa do incidente #16.

### 9.2 Rodar localmente

```bash
docker compose up -d                 # Postgres + Redis locais
cp .env.example .env                 # preencher ENCRYPTION_KEY, SESSION_SECRET, STORAGE_LOCAL_PATH (absoluto)
npm install
npm run db:migrate && npm run db:seed
npm run dev                          # web em http://localhost:3000/login
npm run dev:worker                   # em outro terminal
```

### 9.3 Acompanhar logs do worker em produção

Cada tick/linha imprime uma linha de log JSON estruturada (evento, duração, `workerId`) no stdout do processo — via `docker compose -f docker-compose.prod.yml logs -f worker` (se rodando via compose) ou pelo painel de logs do serviço "App" no EasyPanel (⚠ mecanismo exato de acesso a logs no EasyPanel não documentado no repo — é uma funcionalidade do painel, não do código).

### 9.4 Rollback

Não há mecanismo automatizado de rollback documentado. Pela natureza do EasyPanel (um único serviço/processo, sem blue-green), o "rollback" real é `git revert` do commit problemático seguido de redeploy — decisão explícita registrada em `DECISIONS.md` ("por que corte direto em vez de flag de modo dual"): não há alternância de modo em runtime, só substituição completa do processo. Para o banco, `scripts/restore.sh` restaura um dump anterior (`pg_restore`, exige confirmação digitada por ser destrutivo) — mas não há rollback de *schema* automatizado (uma migration aplicada não tem "down" gerado automaticamente pelo Prisma neste projeto).

Fonte: `README.md` (seções "Atualizar depois de um git push", "Backup e restauração"); `DECISIONS.md` "Por que corte direto em vez de flag de modo dual".

---

## 10. Débito técnico e itens conhecidos mas não implementados

Nenhum `TODO`/`FIXME` real existe no código (grep completo em `apps/`+`packages/`, excluindo `node_modules`/`dist`, só retorna 2 falsos positivos onde "TODO" é a palavra portuguesa "every"). O débito técnico real está documentado em `DECISIONS.md`, não em comentários no código.

**Nota (2026-08-31)**: os dois bugs que estavam listados aqui até a versão anterior deste documento (liberação não atômica do semáforo `provider-slot:*`; imagens de referência não enviadas para OpenRouter) estão corrigidos, testados e não são mais débito pendente — ver seção 8, itens 17–19, e seção 7.2. O Bug A (semáforo) foi além disso **validado contra o Redis de produção real** (item 19): a chave `provider-slot:openrouter` estava de fato vazada (`-1`/sem TTL) e um ciclo real de acquire+release confirmou a autocorreção do código corrigido. Para o Bug B (imagens de referência), o impacto histórico real (quantos artigos publicados via OpenRouter perderam imagens de referência) segue **não confirmado** — a query sugerida em `DECISIONS.md` (`SELECT ... FROM production_lines pl JOIN line_reference_images lri ...`) não chegou a ser rodada contra produção nesta rodada; ⚠ verificar com Rafael.

- **`pgbouncer=true&connection_limit=10` no `DATABASE_URL` de produção**: recomendado em `README.md`/`VERCEL-ENV.md`/`.env.production.example` depois do incidente de conexão presa do worker (seção 8, item 20) — mas só na documentação/exemplos. **Ainda não aplicado de fato** nos painéis da Vercel e do EasyPanel (nem no `.env` local) — ação pendente do usuário; até lá, o novo passo 4 do checklist de deploy (seção 9.1, restart real do worker após migração) é a mitigação em vigor.
- **Driver de storage S3/Supabase**: nunca implementado. A abstração (`StorageDriver`) existe pronta, mas `getStorageDriver()` lança erro para qualquer valor de `STORAGE_DRIVER` diferente de `"local"`. Efeito prático real: imagens de referência não funcionam de forma confiável no deploy dividido atual (web na Vercel, efêmero; worker no EasyPanel, outro host) — documentado como aviso explícito em `VERCEL-ENV.md`.
- **Upgrade Upstash pay-as-you-go vs. arquitetura**: decisão de custo explicitamente deixada para o usuário em 2026-08-29 (`DECISIONS.md`) — parcialmente superada pela migração para cron+Postgres (item 15 da seção 8), mas não há confirmação de que o plano Upstash foi de fato alterado. ⚠ verificar com Rafael o plano atual do Upstash.
- **Fallback de modelo de IA na última tentativa de retry** (`OPENROUTER_TEXT_FALLBACK_MODEL`): documentado como ponto de extensão em 2026-08-27, nunca implementado — "implementar só se pedido depois".
- **Edição de Linha de Produção**: não implementado (seção 5/6).
- **Auto-deploy do EasyPanel**: estado (ligado/desligado) nunca confirmado em nenhum arquivo do repositório. ⚠ verificar com Rafael.
- **`TimeZone` do Postgres de produção (Neon)**: o código do lock cron+Postgres foi escrito para ser imune a isso (`AT TIME ZONE 'UTC'` explícito nos dois sentidos), mas `DECISIONS.md` registra explicitamente "não se sabe se o Neon de produção usa `TimeZone=UTC` por padrão" — nunca confirmado, só tornado irrelevante pela correção.
- **Chaves de provedor de IA de fato cadastradas em produção hoje**: só inferível indiretamente pelos logs/incidentes (aponta para OpenRouter como único ativo) — não confirmável por leitura de código. ⚠ verificar com Rafael.
- **`npm audit`**: CVEs conhecidos do Next 14.x sem correção disponível na série 14 (só em major 15/16) foram aceitos como risco baixo (app pessoal, single-user, atrás de login) — não corrigidos, revisão de upgrade para Next 15+ mencionada como melhoria futura não agendada.
- **Prisma na major 5.22.x**, não a 7.x mais recente — decisão consciente de não fazer o upgrade durante a construção; "revisitar pós-MVP", não revisitado ainda.

---

## 11. Pontos de atenção para evolução futura

Avaliação técnica baseada no código lido, não em suposição:

- **Storage local em disco é o maior ponto frágil se o escopo crescer.** Hoje funciona porque o volume do EasyPanel é persistente e o uso de imagens de referência parece baixo/nulo na prática (só funciona com Gemini, e só se o worker e o storage estiverem no mesmo host). Qualquer aumento de uso de imagens de referência, ou uma migração futura do worker para um ambiente sem disco persistente (ex.: containers efêmeros, mais réplicas), quebra silenciosamente esse recurso. É a lacuna mais concreta entre "abstração pronta" e "implementação real".
- **`WORKER_CONCURRENCY` e réplicas do worker**: o lock `FOR UPDATE SKIP LOCKED` é correto para múltiplas réplicas processando linhas em paralelo, mas nada no código impede alguém de subir 2 réplicas do serviço "App" no EasyPanel sem perceber — o `workerId` (`randomUUID` por processo) existe só para *detectar* isso via log, não para preveni-lo ou balancear carga entre réplicas de propósito.
- **Timeout absoluto de 5min no streaming do OpenRouter está "colado" no `maxDuration=300` da função Vercel** (`apps/web/src/app/api/articles/generate/route.ts`) — documentado como risco residual baixo aceito, mas se o teto de 5min do provider precisar subir por qualquer motivo, os dois valores precisam mudar juntos ou a function da Vercel corta a resposta antes do provider terminar de reportar timeout. **O mesmo vale agora para `SLOT_TTL_SECONDS` do semáforo (seção 7.2)** — três valores (`maxDuration` da Vercel, `DEFAULT_MAX_TIMEOUT_MS` do streaming OpenRouter, `SLOT_TTL_SECONDS` do semáforo) hoje coincidem/estão alinhados por decisão implícita, não por uma constante compartilhada ou comentário cruzado documentando a dependência — mudar qualquer um isoladamente no futuro (ex.: aumentar o teto de streaming para artigos ainda mais longos) reabre silenciosamente a classe de bug corrigida e validada contra produção nos itens 18/19 da seção 8. Vale formalizar essa dependência (constante única, ou pelo menos comentário em cada um dos três arquivos apontando para os outros dois) antes de mexer em qualquer um deles.
- **Prepared statements presas a conexões recicladas pelo pooler do Neon é um padrão de risco genérico, não exclusivo da migração do scheduler.** `packages/db/index.ts` mantém uma única instância de `PrismaClient` de vida longa (web e worker), e `DATABASE_URL` aponta pro endpoint `-pooler` do Neon (PgBouncer, modo transaction) sem `pgbouncer=true`. Qualquer mudança de schema futura pode reintroduzir o sintoma do incidente de 2026-08-31 (seção 8, item 20) — erro "coluna não existe" mesmo com a coluna existindo de fato — se o passo de restart real do worker (seção 9.1, item 4) não for seguido depois de aplicar a migração. Aplicar `pgbouncer=true&connection_limit=10` de fato (hoje só documentado, não aplicado nos painéis — seção 10) elimina essa classe de risco de forma mais permanente do que depender de lembrar de reiniciar.
- **Nenhum teste de carga real** foi executado — os números de "linhas ativas" testados em produção até agora são baixos (2 a 5). O comportamento do semáforo `provider-slot` sob dezenas de linhas simultâneas batendo no mesmo provedor (cenário que o PRD explicitamente pede suportar — "dezenas de linhas ativas... sem degradação") não foi validado com dados reais — a correção da seção 7.2 torna o mecanismo correto sob esse volume, mas não foi *testada* sob esse volume (só sob concorrência baixa/moderada nos testes de integração).
- **Processo de deploy é 100% manual em 3 plataformas independentes** (Vercel, EasyPanel, Neon) sem nenhuma automação de coordenação — já causou um incidente real de produção (P2022, seção 8 #16). Se o ritmo de mudanças de schema aumentar, o risco de repetir esse tipo de incidente é estrutural, não um acaso — não há CI/CD que force a ordem migration→código.
- **Sem testes de carga/concorrência do lock de linha em escala** além dos 8 testes de integração (`postgres-line-lock.integration.test.ts`), que cobrem corretude mas não throughput sob muitas linhas devidas ao mesmo tempo.

---

## 12. Referências

Arquivos-fonte usados para montar cada seção:

- **§1–2 (visão geral, arquitetura)**: `PRD-Wordbee-Clone.md`; `README.md`; `DECISIONS.md` ("Estado final da infraestrutura de produção", "Scheduler cron+Postgres", "Redis único via Upstash", "Investigação de consumo de comandos Redis"); `apps/worker/src/line-scheduler.ts`; `apps/worker/src/postgres-line-lock.ts`; `apps/worker/src/provider-concurrency.ts`; `packages/shared/src/worker-health.ts`.
- **§3 (estrutura do monorepo)**: `package.json` (raiz e workspaces); árvore real de `apps/`, `packages/` (via `find`/`ls`).
- **§4 (modelo de dados)**: `packages/db/prisma/schema.prisma`; `packages/db/prisma/migrations/*`; `DECISIONS.md` "Incidente: migração do scheduler cron+Postgres deployada sem a migração de schema".
- **§5 (módulos implementados)**: `apps/web/src/lib/auth.ts`; `apps/web/src/app/api/auth/*`; `apps/web/src/app/(dashboard)/page.tsx`; `apps/web/src/lib/api-keys.ts`; `apps/web/src/lib/wp-sites.ts`; `apps/web/src/lib/article-pipeline.ts`; `apps/web/src/lib/production-lines.ts`; `apps/web/src/app/api/production-lines/[id]/route.ts`; `apps/worker/src/line-pipeline.ts`; `apps/worker/src/line-pipeline.test.ts`; `apps/web/src/app/(dashboard)/historico/page.tsx`; `apps/web/src/app/api/articles/[id]/resend/route.ts`.
- **§6 (divergências do PRD)**: comparação direta `PRD-Wordbee-Clone.md` §§1,3,5,7 vs. código/schema/`DECISIONS.md`.
- **§7 (provedor de IA)**: `packages/shared/src/ai/registry.ts`; `packages/shared/src/ai/openrouter.ts`; `packages/shared/src/ai/openrouter.test.ts`; `packages/shared/src/ai/http.ts`; `apps/worker/src/provider-concurrency.ts`; `apps/worker/src/provider-concurrency.test.ts`; `apps/worker/src/provider-concurrency.integration.test.ts`; `DECISIONS.md` (entradas de 2026-08-25 sobre OpenRouter, 2026-08-29 sobre o semáforo, 2026-08-31 sobre os dois bugs corrigidos).
- **§8 (incidentes)**: `DECISIONS.md` (integral); `git log --oneline`; `apps/worker/src/line-pipeline.test.ts`; `apps/worker/src/provider-concurrency.integration.test.ts`.
- **§9 (processo operacional)**: `README.md` (seções de deploy); `PROGRESS.md` (linha sobre auto-deploy do EasyPanel não verificado); `DECISIONS.md` "Por que corte direto em vez de flag de modo dual".
- **§10 (débito técnico)**: `VERCEL-ENV.md`; `DECISIONS.md` "Dois bugs reais encontrados na auditoria de PROJECT-STATE.md, corrigidos com TDD" (2026-08-31); grep `TODO|FIXME` em `apps/`+`packages/`.
- **§11 (pontos de atenção)**: leitura direta do código citado acima; nenhuma fonte externa.

---

*Gerado em 2026-08-31. Este documento reflete o estado do repositório no momento da geração — revalidar contra o código antes de usar como base para decisões críticas, especialmente os itens marcados ⚠.*
