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

## ⏳ Ainda não implementado (próximos prompts)

- **PROMPT 2**: Chaves de API (cards reais por provedor + validação real), clientes de IA (OpenAI/Gemini/Grok/Stability), cliente WordPress (REST API), Sites WordPress (CRUD real), gerador unitário "Criar Artigo", Dashboard com dados reais.
- **PROMPT 3**: Linhas de Produção (CRUD, modal, página de detalhe), fila BullMQ real (repeatable jobs, lock por linha, concorrência por provedor), Fila de Títulos, Histórico com filtros/paginação/reenvio.
- **PROMPT 4**: Auditoria de fidelidade visual completa, robustez (skeletons/erros em todas as telas), varredura de segurança (SSRF em URL de site WP, validação de upload), Dockerfiles de produção, README completo, checklist de aceite da seção 9 do PRD.

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
# em outro terminal, o worker (ainda placeholder até o PROMPT 3):
npm run dev:worker
```

App em `http://localhost:3000/login`, com as credenciais definidas em `ADMIN_EMAIL`/`ADMIN_PASSWORD` no `.env`.

## Notas técnicas relevantes

- Ambiente de build usa Node.js 24; um bug conhecido do Next 14 (`<Html> should not be imported outside of pages/_document` ao gerar `/404`/`/500`) foi contornado — a causa raiz era `NODE_ENV` vazando do `.env` para dentro de `next build`. **Nunca defina `NODE_ENV` no `.env`.**
- `npm audit` reporta CVEs conhecidos do Next 14.x sem correção disponível na série 14 (só em major 15/16); ver DECISIONS.md para a análise de risco aceito.
