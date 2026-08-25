# PROGRESS.md

Estado da build do clone pessoal do Wordbee. Atualizado ao final de cada prompt.

## ✅ PROMPT 1 — Fundação (concluído)

### Scaffold
- Monorepo com npm workspaces: `apps/web` (Next.js 14 App Router + TS), `apps/worker` (Node + BullMQ, placeholder), `packages/db` (Prisma), `packages/shared` (cripto, senha, TOTP, sessão).
- Docker Compose (`docker-compose.yml`) para Postgres + Redis em dev.
- `.env.example` completo e documentado (todas as variáveis, incluindo como gerar `ENCRYPTION_KEY` e `SESSION_SECRET`).
- Scripts npm no root: `dev`, `dev:worker`, `build`, `test`, `lint`, `typecheck`, `db:generate`, `db:migrate`, `db:migrate:deploy`, `db:seed`, `db:studio`.

### Banco de dados
- Todas as 7 tabelas da seção 5 do PRD implementadas em `packages/db/prisma/schema.prisma`: `users`, `api_keys`, `wp_sites`, `production_lines`, `line_reference_images`, `title_queue`, `articles`. Mais `sessions` (necessária para "sessões ativas" do Perfil, RF-02).
- Índices nas consultas quentes: `articles` por `createdAt` e por `(lineId, createdAt)` e por `(userId, status)`; `production_lines` por `(nextRunAt, status)`.
- Migração inicial aplicada (`20260824035722_init`).
- Seed (`npm run db:seed`) cria o usuário único a partir de `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME`, com senha em Argon2.

### Criptografia (com testes)
- `packages/shared/src/crypto.ts`: AES-256-GCM, IV aleatório por registro, authTag persistido separadamente, `maskSecret()` para exibição segura, `constantTimeEqual()`.
- 11 testes: round-trip, unicode/vazio, IV único por chamada, falha com authTag adulterado, falha com ciphertext adulterado, falha com chave errada, validação de `ENCRYPTION_KEY`, não vazamento em `JSON.stringify`, mascaramento.
- `password.ts` (Argon2): 4 testes (verifica certo/errado, não vaza plaintext no hash, salt aleatório).
- `session.ts` (JWT HS256 + hash de sessionId): 6 testes (round-trip, expiração, token adulterado, garbage, unicidade de ids, hash determinístico).

### Autenticação (usuário único)
- Login e-mail/senha, sem cadastro público. Tela roxa minimalista em `/login`.
- Sessão: cookie httpOnly assinado (JWT HS256) + registro em `sessions` no Postgres (permite revogação individual).
- Middleware protege todas as rotas do painel e da API, exceto `/login` e `/api/auth/login` (checagem rápida de JWT no Edge). Checagem autoritativa (sessão revogada?) em `getCurrentSession()`, chamada pelo layout do painel e por toda rota de API.
- Rate limit de login via Redis (padrão 5 tentativas / 15 min por IP, configurável).
- 2FA TOTP completo: setup com QR code, verificação, desativação (exige senha atual). Desligado por padrão.
- Perfil 100% funcional: nome, troca de senha (revoga demais sessões), 2FA, lista de sessões ativas com "encerrar".

### Layout e design system
- Shell completo: sidebar roxo/grafite (gradiente, logo WORDBEE, label MENU, item ativo roxo sólido, bloco do usuário fixo no rodapé com logout), header fino com saudação + toggle de tema, responsivo (sidebar vira drawer no mobile via Radix Dialog).
- Componentes base: Button, Card, Modal, Input, PasswordInput (toggle de olho), Select, Textarea, Badge, Toast (Radix, com fila), Skeleton, EmptyState, ProgressBar, Tabs (Radix), Switch (Radix), ConfirmDialog.
- Tema claro/escuro com persistência (`next-themes`) e toggle no header. Claro é o padrão.
- Todos os estados vazios seguem o padrão Wordbee (ícone cinza, título, descrição, CTA roxo).

### Páginas
- As 7 rotas do menu existem com layout, título, subtítulo e estado vazio corretos: Dashboard (esqueleto com métricas zeradas), Criar Artigo, Linhas de Produção, Histórico, Sites WordPress, Chaves de API (com abas Texto/Imagem), Perfil (funcional).

### Qualidade
- `npm run typecheck`, `npm run build` (web + worker + libs) e testes (21/21) rodando limpos.
- Lint (`eslint` no web e no worker) sem erros/avisos.
- Smoke test manual ponta a ponta feito com `next start` real: login, dashboard autenticado, `/api/profile`, `/api/profile/sessions`, bloqueio de rota sem sessão (307/401), logout, e verificação de que o worker conecta em Redis e Postgres.

## ✅ PROMPT 2 — Chaves de API, Sites WordPress e geração unitária (concluído)

### Clientes de IA (`packages/shared/src/ai/`)
- Interface única `TextProvider` (`generateTitles`, `generateArticle`) e `ImageProvider` (`generateImage`), implementadas para OpenAI, Gemini, Grok (xAI) e Stability AI (só imagem).
- Erros normalizados em português (`AiProviderError`: `invalid_key`, `rate_limit`, `timeout`, `content_blocked`, `unknown`), com classificação de status HTTP incluindo o caso especial da Gemini (400 para chave inválida).
- Modelos configuráveis por env (`AI_MODELS`), registry com metadados para a UI (nome, modelo, badge gratuito, placeholder de prefixo, link de documentação).
- `fetchWithTimeout`/`fetchJsonOrThrow` usam `undici` explicitamente (não o `fetch` global) — ver DECISIONS.md sobre o bug do Next.js que isso corrige.

### Prompts por tipo de artigo (`packages/shared/src/prompts/`)
- Os 14 tipos do PRD em arquivos separados (`article-types/*.ts`), cada um com sua estrutura; regras de saída comuns (HTML Gutenberg-friendly, SEO básico, sem markdown) centralizadas em `common.ts`.

### Cliente WordPress (`packages/shared/src/wordpress/`, com testes)
- `testConnection` (via `/users/me?context=edit`, valida `roles.includes("administrator")`), `listCategories`, `uploadMedia`, `createPost`.
- Retry com backoff (3 tentativas) só para falhas de rede/timeout; erros determinísticos (401/403/404) não tentam de novo.
- Guarda anti-SSRF básica (bloqueia localhost/IPs privados) antes de qualquer request.
- 19 testes cobrindo sucesso, cada código de erro, retry/backoff e a guarda SSRF.

### Chaves de API (RF-09 a RF-15)
- Página com abas "IAs para Artigos"/"IAs para Imagens", cards por provedor com badge de modelo, nota de gratuidade, estado configurado/não configurado (chave mascarada), input com olho, link "Como obter a chave".
- Compartilhamento real: OpenAI/Gemini salvam sob `tipo=AMBOS` (uma chave para as duas abas); Grok/Stability por capacidade.
- Chave só é persistida se a validação no provedor for bem-sucedida.

### Sites WordPress (RF-16 a RF-20)
- CRUD completo (criar/editar/excluir com aviso se houver linhas de produção usando o site), ação "Testar" (grava último resultado), categorias carregadas dinamicamente do site.
- Busca por nome quando há mais de 6 sites. Sem limite de quantidade.

### Criar Artigo (RF-21 a RF-23)
- Formulário completo: site, categoria dinâmica, IA de texto/imagem (só provedores com chave válida), tipo, tema, título (com sugestões via IA, editável), prompt customizado, status no WordPress.
- Pipeline (`apps/web/src/lib/article-pipeline.ts`) com progresso em tempo real via streaming NDJSON: título → conteúdo → imagem → publicando. Sem quota/limite em lugar nenhum.
- Cada execução grava um `Article` no banco (mesmo em caso de falha), aparecendo depois no Histórico.

### Dashboard real
- Card de resumo do mês, 3 métricas e "Últimos artigos" consultando o Postgres diretamente (Server Component). "Configurar IAs" vira "IAs configuradas" quando há pelo menos uma chave salva.

### Qualidade
- `npm run typecheck`, `npm run build` (web + worker + libs) e testes (51/51) limpos. Lint sem erros.
- Smoke test manual real (não só mocks): login, listagem de chaves, criação/teste/exclusão de site WordPress (contra domínio inexistente, validando as mensagens de erro), validação de chave falsa contra OpenAI e Gemini de verdade (confirmando `invalid_key` correto), dashboard com dados reais.

### ✅ Validação real ponta a ponta (feita em 2026-08-24)
- Usuário forneceu uma chave Gemini real e as credenciais reais do site `rendadinheiro.com.br`.
- Chave validada e salva (compartilhada texto/imagem), conexão testada com sucesso (`administrator`), categorias reais carregadas (Ações, Criptomoedas, Forex, Ganhar Dinheiro, IA, Negócios Online, Notícias).
- Pipeline completo rodado contra APIs reais: título e conteúdo gerados de verdade pela Gemini; a etapa de imagem esbarrou na cota gratuita de geração de imagem da conta (HTTP 429) — o `Article` ficou `FALHA` com a mensagem certa, visível no Dashboard, exatamente como projetado.
- Essa validação revelou e corrigiu dois problemas reais: o modelo `gemini-2.5-flash` citado no PRD não existe mais (trocado para `gemini-3.6-flash`) e faltava um código de erro para 502/503/504 (`unavailable`, antes caía em `unknown`). Ver DECISIONS.md.
- Pendente: a publicação de fato (`uploadMedia`/`createPost`) só será validada com uma chave de imagem com cota disponível (ex.: aguardar reset da cota gratuita da Gemini, ou outra chave de imagem).

## ✅ PROMPT 3 — Linhas de Produção, worker, fila de títulos e histórico (concluído)

### Storage local (`packages/shared/src/storage/`)
- Abstração `StorageDriver` (save/read/delete/publicUrl); implementação em disco (`local.ts`) usada para as imagens de referência das linhas. `STORAGE_LOCAL_PATH` precisa ser absoluto (web e worker rodam em `cwd` diferentes). Servido via `/api/uploads/[...path]` (autenticado).

### Agendador (`packages/shared/src/queue/`)
- Fila BullMQ compartilhada entre web e worker (`scheduleLineRun`/`cancelLineRun`, `jobId=lineId`). Web agenda/cancela ao criar, pausar, retomar ou excluir uma linha; worker reagenda a próxima execução ao final de cada tick.

### Worker — motor de automação (`apps/worker/src/`)
- `line-pipeline.ts`: executa um "tick" completo de uma linha — consome/gera título (evitando duplicados), gera conteúdo, gera imagem (com imagens de referência quando o provedor é Gemini), publica no WordPress, atualiza contadores e repõe a fila de títulos. Nunca lança para o BullMQ — todo erro é tratado e registrado.
- `lock.ts`: lock por linha via Redis `SET NX PX` — nunca duas execuções simultâneas da mesma linha.
- `provider-concurrency.ts`: semáforo Redis por provedor de IA (`AI_PROVIDER_CONCURRENCY`, padrão 3).
- Idempotência via `idempotencyKey` determinística; retry parcial (3 tentativas com backoff) que só regera a etapa que realmente falhou, reaproveitando conteúdo/imagem já persistidos.
- Máximo de artigos → linha `CONCLUIDA` automaticamente. 5 falhas consecutivas → linha `PAUSADA` com motivo. Rate limit/sobrecarga do provedor → adia o próximo disparo ou pausa a linha, conforme configurado por linha.
- `syncActiveLines()` no boot do worker resincroniza qualquer linha `ATIVA` sem job agendado (resiliência a reinício/Redis limpo).
- 13 testes automatizados cobrindo exatamente os 5 cenários pedidos no PRD: máximo atingido, rate limit (ADIAR e PAUSAR), falha com retry até sucesso, falha esgotando as 3 tentativas, pausa após 5 falhas consecutivas, idempotência/duplicidade, e lock (adquirir/liberar).

### Linhas de Produção (RF-24 a RF-30)
- Listagem em cards (badge de status, site, tipo, intervalo, progresso `N/max`, temas, último/próximo, Pausar/Retomar/Excluir).
- Modal "Nova Linha de Produção" com todos os campos do PRD em duas colunas, incluindo upload de até 5 imagens de referência (staged no cliente, enviadas após a linha ser criada).
- Página de detalhe: galeria de imagens de referência (editável), Fila de Títulos (gerar, editar inline, contador, "previsto para"), Artigos Publicados, botão "Atualizar".

### Histórico (RF-31 a RF-33)
- Lista paginada (20/página) com filtros por site, status, linha/manual e período, busca por título — tudo via query string da URL (Server Component). Ação "Reenviar" nos artigos com falha, reaproveitando conteúdo/imagem já gerados.

### Dashboard
- Alerta visual quando alguma linha foi pausada por 5+ falhas consecutivas, com link direto para a linha.

### Qualidade
- `npm run typecheck`, `npm run build` (web + worker + libs) e testes (65/65) limpos. Lint sem erros/avisos.
- **Validação real ponta a ponta do worker** (não só mocks): linha de produção criada de verdade contra o site `rendadinheiro.com.br` e a chave Gemini já configurados. Título e conteúdo gerados de verdade; rate limit de imagem tratado e reagendado corretamente. Revelou e corrigiu 2 bugs reais (ver DECISIONS.md): `nextRunAt` inconsistente entre banco e fila após falha, e log de rate-limit faltando fora da etapa de título. Publicação de fato segue bloqueada pela mesma cota de imagem gratuita esgotada da conta de teste.

## ✅ PROMPT 4 — Fidelidade visual, robustez e deploy (concluído)

### Segurança
- SSRF completo: guarda anti-SSRF agora resolve DNS e bloqueia domínios que apontam para redes privadas (`assertSafeWordPressUrl`), não só IPs literais. 5 novos testes.
- Varredura completa: 23 das 24 rotas de API confirmadas exigindo sessão válida (a exceção, `/api/auth/logout`, é intencional e inofensiva); nenhuma chave/senha em texto puro em log ou resposta (verificado por grep); uploads de imagem de referência já validavam tipo (PNG/JPEG/WEBP) e tamanho (5MB) desde o PROMPT 3.

### Operação
- **Indicador de saúde do worker**: heartbeat no Redis (`worker:heartbeat`, TTL 90s) + `worker:last_success`, exibido no Dashboard como badge "Worker online/offline".
- **Logs estruturados do worker**: cada evento (título, conteúdo, imagem, publicado, falha, rate limit) sai como JSON com linha/evento/detalhe; um log de resumo por "tick" com a duração total.
- **Scripts de backup/restore** (`scripts/backup.sh`/`restore.sh`, via `pg_dump`/`pg_restore`) — testados contra o banco de dev.

### Robustez
- `loading.tsx` e `error.tsx` no grupo `(dashboard)` — skeleton e tela de erro amigável cobrindo todas as páginas do painel.
- Toasts de sucesso/erro adicionados aos fluxos que só tinham feedback inline (Chaves de API, Sites WordPress, Nova Linha, Criar Artigo).

### Deploy e documentação
- `Dockerfile` do web (build standalone do Next) e do worker (multi-stage, node_modules completo), `docker-compose.prod.yml` (Postgres + Redis + web + worker).
- **Testado de verdade, não só escrito**: subi um Docker daemon local (colima), buildei as duas imagens, rodei a stack completa, apliquei as 5 migrações e o seed exatamente como documentado no README, e confirmei login funcionando pelo container — depois desfiz tudo (`down -v`, imagens removidas, `.env` restaurado, colima parado).
- `README.md` completo: pré-requisitos, cada variável de ambiente explicada, passo a passo de instalação local e de deploy no VPS, como obter cada chave de IA, como gerar a senha de aplicação do WordPress, como usar cada tela, como acompanhar os logs do worker.
- Checklist de aceite da seção 9 do PRD em DECISIONS.md — 9/9 itens implementados; 2 têm validação real parcial (publicação de fato bloqueada pela cota de imagem gratuita já esgotada da conta de teste, não por limitação do código).

### Qualidade
- `npm run typecheck`, `npm run build` (web + worker + libs) e testes (70/70) limpos. Lint sem erros/avisos. Build Docker das duas imagens validado de ponta a ponta.

### ✅ Validação real ponta a ponta em produção — Vercel (feita em 2026-08-24)
- **URL de produção correta**: `https://wordbee-clone-chi.vercel.app` — é o domínio de produção padrão da Vercel, diferente das URLs por-deploy que a API de Deployments do GitHub reporta (essas continuam atrás do SSO da Vercel por padrão; é o comportamento esperado do "Standard Protection", que só isenta o domínio de produção "oficial"/customizado, não os aliases de deploy individuais).
- Testado via requisições HTTP diretas (`curl`, com sessão/cookie reais) em vez de navegador — a extensão Claude in Chrome não foi instalada nesta sessão. Cobre exatamente as mesmas rotas de API e sessão que a UI usa, mas sem confirmação visual de renderização/CSS.
- **(1) Produção acessível sem SSO**: confirmado. `GET /login` responde `200` direto, sem redirect para `vercel.com/sso-api`.
- **(2) Login real**: confirmado. `POST /api/auth/login` com as credenciais do usuário seedado no Neon (`ADMIN_EMAIL`/`ADMIN_PASSWORD` do `.env`) retornou sessão válida (cookie `wordbee_session` httpOnly); todas as rotas do painel foram de `307` (redirect para `/login`, sem sessão) para `200` depois de autenticar.
- **(3) Telas testadas** (todas `200`, autenticado):
  - **Dashboard** (`/`) — OK.
  - **Chaves de API** (`/chaves-de-api`, `GET /api/api-keys`) — OK. Lista os 4 provedores (OpenAI, Gemini, Grok, Stability); nenhuma chave configurada em produção ainda (`configured:false` em todos).
  - **Sites WordPress** (`/sites-wordpress`) — CRUD completo testado: criado um site de teste, ação "Testar" retornou corretamente `ok:false` com a mensagem de erro esperada (domínio inexistente), excluído ao final — sem lixo deixado em produção.
  - **Linhas de Produção** (`/linhas-de-producao`) — tela carrega OK (lista vazia, banco de produção limpo).
  - **Perfil** (`/perfil`, `GET /api/profile`) — OK, retorna os dados do usuário seedado.
  - **Criar Artigo** (`/criar-artigo`) — validação de formulário testada (payload vazio → `400` com erro do Zod); fluxo completo testado com um site WordPress temporário (criado e removido só para esse teste): sem chave de IA configurada, o pipeline retorna corretamente `{step:"titulo", status:"error", message:"Nenhuma chave de IA de texto configurada para este provedor."}` via streaming NDJSON.
- **(4) Geração unitária não depende do worker**: confirmado, tanto pelo código quanto pelo teste acima rodando com o worker inteiramente fora do ar. `POST /api/articles/generate` chama `runUnitArticlePipeline` diretamente dentro da própria rota do Next.js (síncrono, streaming) — nunca passa pela fila BullMQ nem pelo processo do worker. Só as **Linhas de Produção** (execução automática/agendada) dependem do worker estar rodando em algum host always-on (ver `VERCEL-ENV.md`).
- Não havia chave de IA de teste configurada em produção, então não foi possível (nem tentado) gerar um artigo de verdade — só o caminho de validação/erro foi exercitado, conforme combinado.

## ✅ OpenRouter (DeepSeek V4) como 5º provedor de texto (concluído em 2026-08-25)

- **`OpenRouterProvider`** (`packages/shared/src/ai/openrouter.ts`) implementa `TextProvider` (`generateTitles`/`generateArticle`), reaproveitando a mesma estrutura do client OpenAI (endpoint compatível `/chat/completions`) — só trocam `base_url` (`https://openrouter.ai/api/v1`), o modelo (`AI_MODELS.openrouter.text`, configurável via `OPENROUTER_DEFAULT_MODEL`, padrão `deepseek/deepseek-v4-flash-0731` — slug confirmado em openrouter.ai em 2026-08-25) e os headers extras recomendados pelo OpenRouter (`HTTP-Referer`, `X-Title`, valores genéricos do projeto).
- **Só texto nesta versão** — sem card na aba de imagem; `createImageProvider`/`createTextProvider` (`packages/shared/src/ai/index.ts`) lançam erro explícito se chamados fora da capacidade suportada, mesmo padrão já usado para Stability (só imagem).
- **Novo `AiErrorCode` "insufficient_credits"** (`packages/shared/src/ai/errors.ts`) para o HTTP 402 que o OpenRouter usa quando o saldo acaba, com mensagem em PT-BR ("Créditos insuficientes no OpenRouter. Adicione créditos em openrouter.ai."). `classifyHttpError` ganhou esse caso de forma genérica (não específica de provedor).
- **Validação da chave via `GET /models`** (não consome créditos), mesmo padrão de OpenAI/Grok.
- **Enum `AiProvider` do Prisma** ganhou `OPENROUTER` (migração `20260825105312_add_openrouter_provider`, aplicada em produção).
- **Card em "Chaves de API" e selects de "IA para texto"** (Criar Artigo, Nova Linha de Produção) aparecem automaticamente ao adicionar o provedor em `TEXT_PROVIDERS` (`packages/shared/src/ai/registry.ts`) — essas telas já liam a lista de provedores configurados dinamicamente, sem nenhum select hardcoded para ajustar.
- **7 novos testes** em `packages/shared/src/ai/openrouter.test.ts` (título com sucesso incluindo headers extras, créditos insuficientes, chave inválida, timeout, geração de artigo) + 1 teste novo em `errors.test.ts` para o 402. 78/78 testes passando.
- Ver `DECISIONS.md` para o motivo de negócio (OpenRouter como alternativa de pagamento ao DeepSeek direto).

## Como rodar localmente

```bash
# 1. Suba Postgres e Redis (ou use instalações locais)
docker-compose up -d

# 2. Copie e preencha o .env
cp .env.example .env
# gere ENCRYPTION_KEY: openssl rand -base64 32
# gere SESSION_SECRET: openssl rand -base64 48

# 3. Instale as dependências (raiz do monorepo)
npm install

# 4. Rode a migração e o seed (cria o usuário único a partir de ADMIN_EMAIL/ADMIN_PASSWORD)
npm run db:migrate
npm run db:seed

# 5. Suba o app web
npm run dev
# em outro terminal, o worker (processa as Linhas de Produção ativas):
npm run dev:worker
```

App em `http://localhost:3000/login`, com as credenciais definidas em `ADMIN_EMAIL`/`ADMIN_PASSWORD` no `.env`.

## Notas técnicas relevantes

- Ambiente de build usa Node.js 24; um bug conhecido do Next 14 (`<Html> should not be imported outside of pages/_document` ao gerar `/404`/`/500`) foi contornado — a causa raiz era `NODE_ENV` vazando do `.env` para dentro de `next build`. **Nunca defina `NODE_ENV` no `.env`.**
- `npm audit` reporta CVEs conhecidos do Next 14.x sem correção disponível na série 14 (só em major 15/16); ver DECISIONS.md para a análise de risco aceito.
- **Como acompanhar os logs do worker**: rode `npm run dev:worker` (dev) ou `node apps/worker/dist/index.js` (produção) num terminal — cada execução de linha imprime uma linha `[worker] linha=<id> evento=<...>` (título gerado, publicado, falha, rate limit, etc.) em tempo real no stdout desse processo.
