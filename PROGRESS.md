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
- **Só texto nesta entrega inicial** — sem card na aba de imagem ainda; `createImageProvider`/`createTextProvider` (`packages/shared/src/ai/index.ts`) lançavam erro explícito se chamados fora da capacidade suportada, mesmo padrão já usado para Stability (só imagem). **Atualização abaixo: o suporte a imagem foi adicionado no mesmo dia.**
- **Novo `AiErrorCode` "insufficient_credits"** (`packages/shared/src/ai/errors.ts`) para o HTTP 402 que o OpenRouter usa quando o saldo acaba, com mensagem em PT-BR ("Créditos insuficientes no OpenRouter. Adicione créditos em openrouter.ai."). `classifyHttpError` ganhou esse caso de forma genérica (não específica de provedor).
- **Validação da chave via `GET /models`** (não consome créditos), mesmo padrão de OpenAI/Grok.
- **Enum `AiProvider` do Prisma** ganhou `OPENROUTER` (migração `20260825105312_add_openrouter_provider`, aplicada em produção).
- **Card em "Chaves de API" e selects de "IA para texto"** (Criar Artigo, Nova Linha de Produção) aparecem automaticamente ao adicionar o provedor em `TEXT_PROVIDERS` (`packages/shared/src/ai/registry.ts`) — essas telas já liam a lista de provedores configurados dinamicamente, sem nenhum select hardcoded para ajustar.
- **7 novos testes** em `packages/shared/src/ai/openrouter.test.ts` (título com sucesso incluindo headers extras, créditos insuficientes, chave inválida, timeout, geração de artigo) + 1 teste novo em `errors.test.ts` para o 402. 78/78 testes passando.
- Ver `DECISIONS.md` para o motivo de negócio (OpenRouter como alternativa de pagamento ao DeepSeek direto).

## ✅ OpenRouter também como provedor de imagem — "Nano Banana" (concluído em 2026-08-25)

- **`createOpenRouterImageProvider`** (`packages/shared/src/ai/openrouter.ts`) implementa `ImageProvider` via `POST https://openrouter.ai/api/v1/images` (endpoint próprio de imagem, formato diferente de `/chat/completions`), reaproveitando a mesma chave/autenticação Bearer e os mesmos headers extras do provider de texto.
- **Modelo padrão `google/gemini-2.5-flash-image`** ("Nano Banana", slug confirmado via `GET /api/v1/models?output_modalities=image`), configurável por `OPENROUTER_IMAGE_DEFAULT_MODEL`.
- **Suporta imagens de referência** (`input_references`, até 5 por linha — mesmo limite já existente em `production-lines.ts`, RF-25), com **fallback automático**: se o modelo configurado não aceitar `input_references` (400 mencionando o parâmetro no corpo), refaz a chamada sem referência em vez de falhar o artigo inteiro (loga um aviso).
- **Reaproveita o `AiErrorCode` "insufficient_credits"** criado para o provider de texto (mesmo status 402, mesma conta de billing).
- **Chave compartilhada entre texto e imagem** (RF-13): `tipoForSave` (`apps/web/src/lib/api-keys.ts`) passou a tratar `OPENROUTER` como `AMBOS` — o card em "IAs para Imagens" reaproveita a chave já cadastrada na aba de texto, sem pedir de novo.
- **Card e selects de "IA para imagem"** aparecem automaticamente via `IMAGE_PROVIDERS` (`packages/shared/src/ai/registry.ts`), sem tocar em nenhuma tela hardcoded.
- **6 novos testes** (geração simples, com referência, créditos insuficientes, timeout, fallback de referência não suportada, 400 genérico que não aciona o fallback). **84/84 testes passando** no total.
- Ver `DECISIONS.md` para o motivo de negócio (evitar depender só da cota gratuita do Gemini direto e consolidar billing em um único provedor).

## ✅ Remoção de chave de API pela UI (concluído em 2026-08-25)

- Botão **"Remover"** (`Button variant="destructive"`) em cada card de `/chaves-de-api` (`ProviderCard.tsx`), visível só quando a chave está configurada — some junto com o card voltar ao estado "⚠ Nenhuma chave configurada".
- Confirmação via `ConfirmDialog` avisando que linhas de produção e o gerador unitário que usam o provedor param de funcionar até uma nova chave ser configurada.
- **`DELETE /api/api-keys/[provider]/[capability]`** → `deleteApiKey` (`apps/web/src/lib/api-keys.ts`), hard delete idempotente (`deleteMany`, nunca lança erro para chave inexistente). Ver `DECISIONS.md` para a escolha entre hard e soft delete.
- **Provedor de chave compartilhada (OpenAI, Gemini, OpenRouter)**: remover pela aba de texto (ou de imagem) reflete instantaneamente nos dois cards, sem recarregar a página — mesmo mecanismo de leitura (`tiposToQuery`) que já unificava os dois cards para exibir "configurada".
- **6 novos testes** em `apps/web/src/lib/api-keys.test.ts` (primeiro arquivo de teste do `apps/web` — tabela `api_keys` simulada em memória): remoção com sucesso, remoção idempotente de chave inexistente, isolamento por usuário, reflexo simultâneo nos dois cards ao remover por qualquer uma das abas, e que remover um provedor não afeta os demais configurados. **90/90 testes passando** no total (repo inteiro).

## ✅ Correção: geração de artigo via OpenRouter travava indefinidamente (concluído em 2026-08-25)

- **Bug real de produção confirmado e corrigido**: `generateArticle` via OpenRouter ficava pendurado 5+ minutos sem responder nem erro. Causa raiz: `fetchJsonOrThrow` (`packages/shared/src/ai/http.ts`) cancelava o timeout assim que os *headers* da resposta chegavam, deixando a leitura do *corpo* (`res.json()`) sem nenhuma proteção — para uma resposta pequena (título) isso nunca aparecia, mas para um artigo inteiro (corpo grande, mais a latência do proxy do OpenRouter) o corpo podia demorar minutos, e a chamada nunca resolvia nem rejeitava.
- **Não era um bug isolado do OpenRouter** — o mesmo utilitário compartilhado é usado por `generateArticle`/`generateImage` de todos os providers (OpenAI, Gemini, Grok); todos tinham a mesma exposição latente, só ainda não observada.
- `fetchJsonOrThrow` agora cobre `fetch()` **e** a leitura do corpo sob o mesmo `AbortController`/timer — um corpo lento aciona o abort e vira `AiErrorCode "timeout"` normalmente, em vez de travar.
- `DEFAULT_TIMEOUT_MS` compartilhado subiu de 30s para 60s (evita que outros providers passem a estourar timeout de verdade cedo demais, agora que o timeout é realmente aplicado). OpenRouter ganhou um `ARTICLE_TIMEOUT_MS` explícito de 90s só para `generateArticle` (mesmo mecanismo de `generateTitles`, janela maior).
- Confirmado que `maxDuration = 300` da rota `POST /api/articles/generate` já comporta os novos timeouts (60-90s) sem cortar a função antes da hora.
- **2 novos testes de regressão** em `openrouter.test.ts` simulando fielmente o cenário do bug (headers OK, leitura do corpo trava até o `AbortSignal` disparar) — um para `generateArticle` (90s) e um confirmando que `generateTitles` usa o mesmo mecanismo com a janela padrão (60s). Rodados com fake timers, sem esperar de verdade. **92/92 testes passando** no total.
- Ver `DECISIONS.md` para a análise completa da causa raiz.

## ✅ Correção: crash ao ativar/pausar linha de produção (concluído em 2026-08-25)

- **Bug real de produção**: clicar em ativar/pausar numa linha quebrava a tela com "Algo deu errado" (`TypeError: undefined is not an object (evaluating 'l.wpSite.nome')`), junto com um `400`/método não implementado em `GET /api/production-lines/[id]/reference-images`.
- **Causa raiz**: `pauseProductionLine`/`resumeProductionLine` (e também `createProductionLine`, mesmo bug, achado durante a investigação) faziam a mutação no Postgres sem `include: { wpSite }`, devolvendo uma linha sem a chave que `ProductionLineSummary` declara como obrigatória. Corrigido com uma constante `WP_SITE_INCLUDE` compartilhada entre as três funções (`apps/web/src/lib/production-lines.ts`).
- **Guard defensivo** `line.wpSite?.nome ?? "—"` adicionado em `LineCard.tsx` e `LineDetailClient.tsx`, independente da causa raiz — payload incompleto de qualquer endpoint futuro não deve mais derrubar a tela.
- **`GET /api/production-lines/[id]/reference-images` implementado** (só existia `POST` antes) — devolve `{ images: [] }` com 200 pra linha sem imagens, 404 se a linha não existir.
- Validado com uma query direta contra o Postgres de produção reproduzindo a query corrigida na linha real existente — `wpSite` presente no resultado. Ver `DECISIONS.md` para a análise completa (inclusive por que o toggle já estava parcialmente blindado por um merge incidental no frontend, mas `create` não).
- `typecheck`, `lint`, `build` e os 92 testes automatizados continuam passando.

### Fechamento (2026-08-25, depois do push)

- **O "400" original nunca foi reproduzido** — testado de verdade (servidor local em modo produção + `curl` autenticado contra o código pré-correção): o status real é **405** (Method Not Allowed), não 400. Não há causa alternativa (middleware, rota intermediária) — só faltava o handler `GET`, que agora existe.
- **Teste manual do clique confirmado** (Playwright + Chrome, sessão real): `PATCH` retorna 200 com `wpSite` presente no corpo, sem crash na tela, nome do site continua visível. Durante esse teste, o clique em "Retomar" acabou sendo processado de verdade pelo worker já implantado (ambiente de produção compartilhado, sem sandbox local) — a linha "teste" concluiu (3/3, "Máximo de artigos atingido"), gerando 2 artigos reais como **rascunho** no WordPress. Confirmado com o usuário: é exatamente o comportamento correto de RF-28, validado visualmente por ele em produção depois.
- **Push feito**: commit `57af34f` em `main` (`ee7758a..57af34f`).
- **Vercel**: deploy automático disparou e concluiu com sucesso pro commit `57af34f` (confirmado via GitHub Deployments API, `state: success`). Smoke test rodado direto contra `https://wordbee-clone-chi.vercel.app` (produção real): `GET reference-images` → `200 {"images":[]}`; `GET` do detalhe da linha → `wpSite` presente; `PATCH resume` numa linha já concluída → `400` limpo com a mensagem de negócio certa (sem crash, sem disparar execução real). **Os três confirmam o código novo rodando em produção.**
- **Railway: o auto-deploy NÃO disparou para os últimos 3 commits** (`cb8340c`, `ee7758a`, `57af34f`). Confirmado via GitHub Deployments API — o último deployment registrado pelo `railway-app[bot]` é do commit `c8950d0`, às 14:44 UTC de 2026-08-25; nenhum registro depois disso. Não foi possível investigar a causa nem disparar manualmente pela CLI: a sessão `railway` autenticada nesta máquina (`jean@vendedormestre.com.br`) não tem acesso ao projeto da Railway do wordbee-clone (`railway link --project <id-real>` retornou "not found in workspace"; os projetos visíveis são de outro cliente). **Ação pendente do usuário**: checar no painel da Railway por que o GitHub trigger parou de disparar depois do commit `c8950d0` (integração desconectada? falha silenciosa?) e, se necessário, redeployar manualmente o serviço "web" (e conferir o "worker" também) até pegarem o commit `57af34f`.

## ✅ Preparação da migração Railway -> VPS próprio (EasyPanel) (concluído em 2026-08-25)

- **Escopo confirmado com o usuário antes de mexer em código**: só **worker + Postgres + Redis** saem da Railway para o VPS/EasyPanel — o app **web continua na Vercel**. Não houve reversão da decisão de remover `output: "standalone"` (`apps/web/Dockerfile` continua obsoleto/não usado, `next.config.mjs` intocado). Ver `DECISIONS.md` para a análise completa e a alternativa descartada (mover tudo, inclusive o web).
- **Auditoria do que já existia (PROMPT 4)**: `docker-compose.prod.yml`, `apps/worker/Dockerfile` e `docker-compose.yml` (dev) já tinham healthcheck, `restart: unless-stopped` e volume persistente do Postgres — nada faltando ali. `apps/web/Dockerfile` estava (e continua) marcado obsoleto, fora do escopo desta migração.
- **`docker-compose.prod.yml` perdeu o serviço `web`** — mantém só `worker`+`postgres`+`redis`. Revalidado de ponta a ponta nesta sessão (não só lido): `docker build` da imagem do worker, `docker compose up -d --build` com os três serviços, `prisma migrate deploy` rodado contra o Postgres do compose, e log do worker confirmando `Redis conectado` / `Postgres conectado` / `Processador de Linhas de Produção pronto` sem erro. Ambiente de teste (`-p wbtest`) descartado no final (`down -v`).
- **`scripts/backup.sh`/`scripts/restore.sh` estendidos** para aceitar `DATABASE_URL` já exportada no ambiente (além de ler do `.env`), permitindo `DATABASE_URL="<railway>" ./scripts/backup.sh` + `DATABASE_URL="<vps>" ./scripts/restore.sh <dump>` sem editar arquivo nenhum — reaproveita a ferramenta de backup de rotina em vez de um script novo. `restore.sh` ganhou um aviso explícito sobre `ENCRYPTION_KEY` divergente na tela de confirmação.
- **`.env.production.example` criado** — todas as variáveis de produção, organizadas por onde configurar cada uma (Vercel vs. EasyPanel/worker), com destaque para `ENCRYPTION_KEY` (copiar a existente, nunca gerar de novo).
- **`README.md`**: nova seção "Deploy no EasyPanel" com o passo a passo completo (Postgres/Redis via templates nativos do EasyPanel, worker como App a partir de `apps/worker/Dockerfile`, sem domínio/porta pro worker por não ter servidor HTTP, reapontar `DATABASE_URL`/`REDIS_URL` da Vercel), nova seção "Migração de dados (Railway -> VPS)" com o passo a passo de dump/restore, e a antiga "Deploy no VPS" renomeada para "Deploy no VPS sem EasyPanel (fallback)" e ajustada para não ter mais o serviço `web`.
- **`typecheck`, `lint` (web + worker) e `build` (libs + web + worker) rodados de novo depois de todas as mudanças** — só docs/compose/scripts foram tocados, nenhum código de aplicação mudou, mas confirmado sem regressão mesmo assim.
- **Deploy real NÃO executado** — este trabalho deixou compose, scripts, `.env.production.example` e documentação prontos; a criação do projeto/serviços no EasyPanel, a migração de dados de fato e o desligamento da Railway são passos manuais do usuário, sem acesso do Claude Code ao EasyPanel/VPS.

## ✅ Investigação: worker não processava jobs pós-migração (Redis divergente) (concluído em 2026-08-25)

- **Sintoma reportado**: worker no EasyPanel não processava jobs das Linhas de Produção agendados pelo web (Vercel).
- **Investigação de código confirmou que não é bug**: `apps/web/src/lib/production-lines.ts` → `scheduleLineRun`/`cancelLineRun` (`packages/shared/src/queue/index.ts`, produtor) e `apps/worker/src/redis.ts`/`production-line-worker.ts` (consumidor) já leem a **mesma** variável `REDIS_URL`; `apps/web/src/lib/redis.ts` (rate limit de login) também lê `REDIS_URL` — mesma variável, conexões `ioredis` separadas. Nenhuma variável alternativa existe no código (confirmado por busca completa `REDIS`/`UPSTASH`).
- **Causa raiz real**: configuração de ambiente — `REDIS_URL` da Vercel e do worker no EasyPanel apontavam para Redis diferentes (worker configurado com o Redis interno do EasyPanel, inalcançável pela Vercel). Falha silenciosa: nenhum erro em nenhum dos dois lados, os jobs só nunca eram consumidos.
- **Decisão tomada (avaliada, não perguntada — delegada explicitamente pelo usuário)**: manter uma única `REDIS_URL` para fila BullMQ + rate limit (não separar em duas variáveis) — análise completa em `DECISIONS.md`. Trocar a origem do Redis de "template nativo do EasyPanel" para **Upstash externo**, já que a Vercel (produtora dos jobs) tem IP de saída dinâmico e não pode depender de forma confiável de um Redis exposto na rede do EasyPanel.
- **Código comentado** (não alterado em comportamento) em `apps/web/src/lib/redis.ts`, `packages/shared/src/queue/index.ts` e `apps/worker/src/redis.ts` — deixa explícito que os três pontos precisam da mesma `REDIS_URL` e que a falha é silenciosa.
- **`README.md`** ("Deploy no EasyPanel", renomeado para deixar claro que o Redis não é mais template do EasyPanel) e **`.env.production.example`** atualizados com o passo Upstash, o aviso sobre IP dinâmico da Vercel, e o passo 7 revisado para validar ponta a ponta (criar/editar uma linha de verdade e confirmar nos logs do worker) antes de desligar a Railway — não só "worker está de pé".
- **`typecheck`, `lint` e `build` rodados de novo** — passaram sem erro (só comentários/docs mudaram, nenhuma lógica).
- **Nenhuma variável de ambiente real foi alterada** — pedido explícito do usuário; reconfigurar `REDIS_URL` na Vercel/EasyPanel para o mesmo valor Upstash é passo manual dele.

## ✅ Migração de infraestrutura concluída e validada — Railway descontinuada (2026-08-25)

- **Estado final de produção confirmado pelo usuário**, validado com um teste real de ponta a ponta (linha de produção processada e artigo publicado de verdade pelo worker no EasyPanel):
  - **web** (Next.js) → **Vercel**.
  - **worker** (BullMQ) → **EasyPanel**, único serviço no VPS (Docker), sem Postgres/Redis locais.
  - **Postgres** → **Neon**, mesma instância para web e worker.
  - **Redis** → **Upstash**, mesma instância para web e worker (fila BullMQ + rate limit de login).
  - **Railway**: descontinuada por completo — nenhum serviço rodando lá.
- **Nota**: o Postgres acabou em Neon, não no template nativo do EasyPanel como planejado inicialmente na preparação da migração (ver entrada anterior) — mesma razão da escolha do Upstash para Redis (Vercel com IP de saída dinâmico precisa de endpoint público pensado para isso). Análise completa em `DECISIONS.md` ("Estado final da infraestrutura de produção — Railway descontinuada").
- **Documentação consolidada para refletir o estado final, não mais um "plano de migração"**:
  - `README.md`: seção "Deploy no EasyPanel" reescrita como descrição do estado atual (tabela web/worker/Postgres/Redis por onde cada peça roda), passo a passo renumerado (Neon → Upstash → projeto EasyPanel → worker → migração → Vercel → validação), removida a seção "Migração de dados (Railway -> VPS)" (Railway não existe mais; o conteúdo genericamente útil — override de `DATABASE_URL` nos scripts de backup/restore e o aviso de `ENCRYPTION_KEY` — foi incorporado à seção "Backup e restauração do banco", já que segue válido para qualquer migração futura de Postgres). Seção "Deploy no VPS sem EasyPanel (fallback)" com a menção a Railway trocada por Vercel.
  - `VERCEL-ENV.md`: trocadas as referências genéricas "Railway/Fly.io" (worker) e "Supabase/Neon/Railway" (Postgres) / "Upstash/Railway" (Redis) pelo ambiente real em uso (EasyPanel/Neon/Upstash), deixando claro que `DATABASE_URL`/`REDIS_URL` precisam ser idênticas entre Vercel e EasyPanel.
  - `.env.production.example`: **estava desatualizado e foi corrigido** — o comentário de `DATABASE_URL` ainda descrevia Postgres hospedado no EasyPanel (plano original, nunca foi o que rodou de fato); atualizado para Neon. Banner do topo trocado de "três plataformas" (web/worker+Postgres/Redis) para "quatro serviços" (web, worker, Postgres=Neon, Redis=Upstash). Removidas as duas últimas menções a Railway (aviso de `ENCRYPTION_KEY` e referência à seção "Migração de dados", que não existe mais no README).
  - Entradas anteriores de `DECISIONS.md`/`PROGRESS.md` que mencionam Railway (o bug de deploy do "web" lá, o plano inicial de migração) **não foram reescritas** — permanecem como registro histórico correto para a data em que foram escritas; uma nova entrada no topo de cada arquivo documenta que esse estado foi superado.
- **Nenhum código de aplicação foi tocado** — só documentação (`README.md`, `VERCEL-ENV.md`, `DECISIONS.md`, `PROGRESS.md`); `typecheck`/`lint`/`build` não foram re-executados nesta rodada por não haver mudança de código (pedido explícito do usuário).

## ✅ Correção: linha ATIVA ficava sem job agendado após reiniciar (colisão de jobId no BullMQ) (concluído em 2026-08-27)

- **Bug real de agendamento**: `scheduleLineRun(lineId, ...)` (jobId = lineId) era chamado de dentro do próprio processor da linha — `scheduleNext`, `handleDeterministicFailure`, `handleRateLimit` e o bloco de sucesso de `runProductionLine`, todos em `apps/worker/src/line-pipeline.ts` — enquanto o job atual, com esse mesmo jobId, ainda estava `active` na fila. O BullMQ ignora silenciosamente um `add()` com jobId já existente em qualquer estado da fila (sem erro, sem log): `nextRunAt` era gravado certo no Postgres (linha continuava "Ativa" com hora certa na tela), mas nenhum job novo entrava na fila de fato. A linha só voltava a rodar se o worker reiniciasse. Análise completa da causa raiz em `DECISIONS.md`.
- **Correção**: todo o reagendamento saiu do processor e foi para os handlers `worker.on("completed")`/`worker.on("failed")` em `apps/worker/src/production-line-worker.ts` — o BullMQ já remove o job da fila antes de disparar esses eventos, então o jobId está livre quando `scheduleLineRun` roda, sem colisão. `line-pipeline.ts` continua persistindo `nextRunAt`/`status` no Postgres normalmente, só parou de tocar na fila; `scheduleNext` foi inlined por não sobrar utilidade própria.
- **Novo teste de integração com BullMQ + Redis reais** (`apps/worker/src/production-line-worker.integration.test.ts`): sobe um `redis-server` efêmero em processo filho (em vez de mockar `scheduleLineRun` ou usar `ioredis-mock`, que não reproduz com fidelidade a semântica de fila do BullMQ) e confirma que, depois de um job completar, existe de fato um job `delayed` com `jobId = lineId` na fila — exatamente o cenário que o bug quebrava silenciosamente. Pulado automaticamente se `redis-server` não estiver disponível no ambiente. `line-pipeline.test.ts` ganhou `expect(scheduleLineRun).not.toHaveBeenCalled()` em todos os caminhos de negócio (sucesso, falha determinística, rate limit ADIAR/PAUSAR, idempotência).
- **Qualidade**: `typecheck`, `lint`, `build` (libs + web + worker) e os 94 testes automatizados (92 anteriores + 2 novos) passando, incluindo o teste de integração real contra Redis.

## ✅ Correção: job "failed" morto podia bloquear cancelLineRun/syncActiveLines pra sempre — bug primo do anterior (concluído em 2026-08-27, mesmo dia)

- **Investigação em produção (Redis Upstash + Postgres Neon, credenciais já no `.env`, só leitura)**: as 5 linhas de teste estavam saudáveis no momento da checagem — todas `ATIVA` com job `delayed` correspondente, nenhum job `failed` na fila inteira. Os 5 jobs tinham timestamp idêntico (~12:22 UTC), condizente com terem sido recriados de uma vez por `syncActiveLines()` no restart pós-deploy do fix anterior — ou seja, o sintoma relatado já não estava mais presente nesse momento. Não há evidência de crash não tratado nos artigos `FALHA` recentes (só timeouts já tratados normalmente). Análise completa em `DECISIONS.md`.
- **A hipótese é um bug real confirmado por revisão de código, mesmo sem instância viva encontrada**: `getDecryptedApiKey`/`getSiteCredentials` e outras chamadas ao Postgres em `runProductionLine` rodavam fora de qualquer try/catch — uma falha ali vira exceção não tratada, o job do BullMQ vira `failed` de verdade, e como `cancelLineRun()` só removia jobs `waiting`/`delayed` e `syncActiveLines()` só checava se existia ALGUM job (não seu estado), essa linha ficaria com o jobId ocupado por um job morto pra sempre — nem `scheduleLineRun` nem reinícios do worker resolveriam.
- **Correção em 3 partes**: `cancelLineRun` (`packages/shared/src/queue/index.ts`) agora remove qualquer job que não esteja `active` (era só waiting/delayed); `syncActiveLines` (`apps/worker/src/production-line-worker.ts`) agora checa o estado do job existente, não só sua presença, e reagenda se o estado não for waiting/delayed/active; `runProductionLine` (`apps/worker/src/line-pipeline.ts`) virou um wrapper com try/catch cobrindo a função inteira (implementação real movida para `runProductionLineInner`) — garantia definitiva de que ela nunca mais rejeita, não importa o que dê errado internamente.
- **2 novos testes de integração** com BullMQ + Redis reais confirmando exatamente o cenário: um processor que rejeita de propósito ainda assim fica reagendável via handler `"failed"`; e um `Worker` cru (sem os handlers de recuperação) deixando um job preso em `failed` de propósito, recuperado isoladamente por `syncActiveLines()`. **2 novos testes unitários** em `line-pipeline.test.ts` forçando `getDecryptedApiKey` a rejeitar de verdade, confirmando que `runProductionLine` nunca lança.
- **Recuperação imediata**: rodei `syncActiveLines()` (já corrigido) uma vez contra o Redis/Postgres reais de produção via script descartável — sem efeito porque as 5 linhas já estavam saudáveis, mas confirmou que o caminho de recuperação sob demanda funciona sem precisar reiniciar o worker de verdade.
- **Qualidade**: `typecheck`, `lint`, `build` e os 98 testes automatizados (94 anteriores + 4 novos) passando.

## ⚠️ Achado crítico + instrumentação de produção: os 2 fixes acima nunca chegaram a ser deployados (2026-08-27, mesmo dia)

- **Por que "mesmo com os fixes" o worker seguiu reagendando as 5 linhas do zero a cada restart**: as duas correções registradas nas duas entradas acima nunca foram commitadas nem enviadas ao GitHub — `git log` confirma que o último commit a tocar esses arquivos é de muito antes de hoje (PROMPT 4). Elas existiam só no working tree local desta sessão. Sem commit/push não há deploy possível no EasyPanel — o worker em produção rodou o dia inteiro com o código de ANTES de qualquer um dos dois fixes.
- **Investigação em produção confirmou exatamente esse cenário**: `worker:heartbeat` fresco no Redis (processo vivo, não caiu) mas `queue.getJobCounts()` zerado em todo estado e as 5 linhas com `nextRunAt` no passado sem nenhum job — o bug original (reagendar de dentro do próprio job ainda `active`, descartado silenciosamente pelo BullMQ). Nenhum job `failed` preso foi encontrado — o "bug primo" nem chegou a se manifestar porque o código que o corrige também nunca foi deployado. A linha "Documentação e Burocracia" (0/10) não tem nenhum problema adicional: mesma chave OpenRouter válida e compartilhada das outras linhas, só teve azar de bater timeout nas 3 tentativas que rodou até agora. Análise completa em `DECISIONS.md`.
- **Instrumentação adicionada (sem mudar comportamento) pra investigar o resto sem mais suposição**: `workerId` por processo em todo log de `production-line-worker.ts` (detecta múltiplas instâncias competindo pela fila, caso apareçam 2 ids diferentes intercalados no log — item pendente de conferência do usuário no painel do EasyPanel); logs explícitos antes/depois de `scheduleLineRun` nos handlers `completed`/`failed` (`reschedule_pos_completed`); `scheduleLineRun` agora retorna o `Job` criado e loga `queue_add` com id/delay confirmados pelo próprio BullMQ; heartbeat de log periódico a cada 5 min (`evento: "heartbeat"`, distinto do heartbeat de Redis que só alimenta o badge do Dashboard) pra saber pelo log do EasyPanel se o processo ficou vivo o dia inteiro; latência real de cada chamada ao OpenRouter (`openrouter_call`, com `duracaoMs` e `resultado: ok|timeout|erro`) mesmo quando dá timeout, pra distinguir degradação sustentada do provedor de algo mais específico.
- **Decisão**: os dois fixes pendentes e a instrumentação desta rodada foram commitados e enviados juntos — deployar só os logs em cima do código antigo/quebrado não faria sentido nenhum.
- **Qualidade**: `typecheck`, `lint`, `build` e os 98 testes automatizados seguem passando (instrumentação não muda lógica de negócio, só adiciona `console.log`/`console.error` estruturado e o tipo de retorno de `scheduleLineRun`, mudança aditiva).
- **Deploy**: enviado ao GitHub (`main`) nesta sessão. O EasyPanel pode estar configurado com deploy automático no push ou exigir redeploy manual pelo painel — não verificado remotamente (sem acesso ao EasyPanel); confirmar lá que o novo commit está de fato rodando antes de reavaliar os logs.

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
