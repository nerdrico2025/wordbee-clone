# Wordbee Clone — Automação Pessoal de Artigos para WordPress

Aplicação web de uso pessoal para gerar e publicar artigos no WordPress automaticamente com IA — geração unitária ("Criar Artigo") ou em piloto automático 24/7 ("Linhas de Produção"). Usuário único, sem planos, sem pagamentos, sem limites artificiais.

> Especificação completa em [`PRD-Wordbee-Clone.md`](./PRD-Wordbee-Clone.md). Decisões técnicas registradas em [`DECISIONS.md`](./DECISIONS.md). Estado da build em [`PROGRESS.md`](./PROGRESS.md).

---

## Sumário

- [Pré-requisitos](#pré-requisitos)
- [Instalação local](#instalação-local)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Como obter cada chave de IA](#como-obter-cada-chave-de-ia)
- [Como gerar a senha de aplicação no WordPress](#como-gerar-a-senha-de-aplicação-no-wordpress)
- [Como usar: sites, chaves, artigos e linhas de produção](#como-usar)
- [Deploy no VPS](#deploy-no-vps)
- [Backup e restauração do banco](#backup-e-restauração-do-banco)
- [Scripts disponíveis](#scripts-disponíveis)
- [Arquitetura](#arquitetura)

---

## Pré-requisitos

- **Node.js 20+** e **npm 10+**
- **Docker** e **Docker Compose** (para Postgres/Redis em dev, e para o deploy)
- Uma conta em pelo menos um provedor de IA (Gemini tem plano gratuito — veja abaixo)
- Um site WordPress com a REST API habilitada (padrão em qualquer instalação moderna)

## Instalação local

```bash
# 1. Suba Postgres e Redis
docker compose up -d
# (se preferir sem Docker: instale Postgres 16+ e Redis 7+ localmente e
#  ajuste DATABASE_URL/REDIS_URL no .env de acordo)

# 2. Copie o arquivo de exemplo e preencha as variáveis
cp .env.example .env

# gere a chave de criptografia (AES-256-GCM, 32 bytes em base64):
openssl rand -base64 32
# gere o segredo de sessão (JWT):
openssl rand -base64 48
# cole os dois no .env em ENCRYPTION_KEY e SESSION_SECRET

# defina STORAGE_LOCAL_PATH como um caminho ABSOLUTO no seu disco, ex.:
# STORAGE_LOCAL_PATH="/Users/voce/wordbee-clone/storage/uploads"

# 3. Instale as dependências do monorepo (raiz)
npm install

# 4. Rode a migração do banco e o seed (cria seu usuário único)
npm run db:migrate
npm run db:seed

# 5. Suba o app web
npm run dev

# 6. Em outro terminal, suba o worker (processa as Linhas de Produção)
npm run dev:worker
```

Acesse `http://localhost:3000/login` com o `ADMIN_EMAIL`/`ADMIN_PASSWORD` que você definiu no `.env`.

## Variáveis de ambiente

Todas documentadas com exemplos em [`.env.example`](./.env.example). Resumo:

| Variável | O que é | Como preencher |
|---|---|---|
| `DATABASE_URL` | Conexão com o Postgres | `postgresql://usuario:senha@host:5432/banco` |
| `REDIS_URL` | Conexão com o Redis (fila/agendamento) | `redis://host:6379` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | Credenciais do seu usuário único, usadas pelo `npm run db:seed` | Escolha as suas; a senha pode ser trocada depois em Perfil |
| `SESSION_SECRET` | Assina o cookie de sessão (JWT HS256) | `openssl rand -base64 48` |
| `SESSION_TTL_HOURS` | Duração da sessão | Padrão `168` (7 dias) |
| `ENCRYPTION_KEY` | Chave-mestra AES-256-GCM para criptografar chaves de API e senhas de aplicação WordPress | `openssl rand -base64 32` — **nunca perca isso depois de ter dados salvos, ou eles ficam ilegíveis** |
| `STORAGE_DRIVER` | Driver de storage para imagens de referência | `local` (único implementado) |
| `STORAGE_LOCAL_PATH` | Pasta onde as imagens de referência ficam salvas | **Caminho absoluto** (web e worker rodam em diretórios diferentes) |
| `AI_PROVIDER_CONCURRENCY` | Chamadas simultâneas de IA por provedor entre todas as linhas | Padrão `3` |
| `WORKER_CONCURRENCY` | Linhas processadas em paralelo pelo worker | Padrão `5` |
| `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` / `_WINDOW_MINUTES` | Rate limit do login | Padrão 5 tentativas / 15 min |
| `OPENAI_TEXT_MODEL`, `GEMINI_TEXT_MODEL`, etc. | Nomes de modelo por provedor (opcional) | Só mude se um provedor descontinuar o modelo padrão — ver DECISIONS.md |
| `PORT` | Porta do app web | Padrão `3000` |

⚠️ **Nunca defina `NODE_ENV` no `.env`** — o Next.js e o worker já escolhem o valor certo sozinhos; sobrescrever quebra o build de produção (ver nota em `PROGRESS.md`).

As chaves de API dos provedores de IA (OpenAI, Gemini, Grok, Stability) **não vão no `.env`** — são cadastradas pela tela "Chaves de API" dentro do app e ficam criptografadas no banco.

## Como obter cada chave de IA

| Provedor | Onde gerar | Observação |
|---|---|---|
| **Gemini** (recomendado para começar) | https://aistudio.google.com/apikey | Gratuito até 1500 req/dia (texto) e 500/dia (imagem) |
| **OpenAI** | https://platform.openai.com/api-keys | Cobrança por uso (GPT-4o e DALL-E 3) |
| **Grok (xAI)** | https://console.x.ai | Cobrança por uso |
| **Stability AI** | https://platform.stability.ai/account/keys | Créditos grátis para novos usuários |

Cole a chave na tela **Chaves de API** do app (aba "IAs para Artigos" ou "IAs para Imagens" conforme o caso). Ao salvar, o app faz uma chamada real e barata ao provedor para validar a chave antes de gravá-la.

## Como gerar a senha de aplicação no WordPress

1. No seu WordPress, vá em **Usuários → Perfil** (com um usuário de perfil **Administrador**).
2. Role até **Senhas de aplicação**.
3. Dê um nome (ex.: "Wordbee Clone") e clique em **Adicionar Nova Senha de Aplicação**.
4. Copie a senha gerada (formato `xxxx xxxx xxxx xxxx`) — ela só aparece uma vez.
5. No app, vá em **Sites WordPress → + Novo site** e preencha nome, URL, o nome de usuário do WordPress e essa senha de aplicação.
6. Clique em **Testar** no card do site para confirmar a conexão.

## Como usar

- **Criar Artigo**: geração unitária. Escolha site, categoria, IA de texto/imagem, tipo de artigo, tema, gere (ou digite) um título e clique em Gerar Artigo — acompanhe o progresso em tempo real.
- **Linhas de Produção**: piloto automático. Crie uma linha com intervalo, tema(s), tipo de artigo e (opcional) máximo de artigos. O worker processa a linha sozinho, no intervalo configurado, gerando e publicando artigos, e repondo a Fila de Títulos automaticamente.
  - **Pausar**: clique em "Pausar" no card da linha ou na página de detalhe — a próxima execução agendada é cancelada.
  - **Retomar**: clique em "Retomar" — a linha volta a rodar imediatamente e depois no intervalo configurado.
  - **Acompanhar**: a página de detalhe da linha mostra a Fila de Títulos (com horário previsto) e os Artigos Publicados. O Dashboard mostra um indicador "Worker online/offline" e um alerta se alguma linha for pausada por falhas consecutivas.
- **Histórico**: todos os artigos (manuais e de linhas), com filtros por site/status/linha/período e busca por título. Artigos com falha têm o botão **Reenviar**, que reaproveita o conteúdo/imagem já gerados em vez de regerar tudo.

### Acompanhando os logs do worker

Rode `npm run dev:worker` (dev) ou `docker compose -f docker-compose.prod.yml logs -f worker` (produção) — cada execução de linha imprime uma linha de log estruturada (JSON) por evento: título gerado, conteúdo, imagem, publicado, falha, rate limit, com a duração total do "tick" ao final.

## Deploy no VPS

Pré-requisito: Docker + Docker Compose no servidor.

```bash
# 1. Clone o repositório no servidor
git clone <seu-repositorio> wordbee-clone
cd wordbee-clone

# 2. Configure o .env de produção
cp .env.example .env
# preencha DATABASE_URL não é necessário (o compose já injeta com base em
# POSTGRES_PASSWORD); defina:
#   POSTGRES_PASSWORD=<uma senha forte>
#   REDIS_URL não é necessário (o compose já aponta pro serviço redis)
#   ENCRYPTION_KEY, SESSION_SECRET (gere como acima)
#   ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME
#   STORAGE_LOCAL_PATH=/repo/storage/uploads   <- caminho DENTRO do container

# 3. Suba os containers
docker compose -f docker-compose.prod.yml up -d --build

# 4. Rode a migração do banco (uma vez, e a cada atualização com nova migração)
docker compose -f docker-compose.prod.yml run --rm worker \
  sh -c "cd packages/db && npx prisma migrate deploy"

# 5. Rode o seed (cria seu usuário único — só na primeira vez)
docker compose -f docker-compose.prod.yml run --rm worker \
  sh -c "cd packages/db && npx tsx prisma/seed.ts"
```

O app fica em `http://SEU_IP:3000` — configure um proxy reverso (Nginx/Caddy) com TLS na frente para expor com HTTPS. Depois de configurar o proxy, adicione `ADMIN_PASSWORD` forte e considere ativar o 2FA em Perfil.

Para atualizar depois de um `git pull`:

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml run --rm worker sh -c "cd packages/db && npx prisma migrate deploy"
```

## Backup e restauração do banco

```bash
# Backup (salva em ./backups/wordbee_<timestamp>.dump)
./scripts/backup.sh

# Restaurar (SOBRESCREVE o banco atual — pede confirmação)
./scripts/restore.sh backups/wordbee_20260101_120000.dump
```

Os dois scripts leem `DATABASE_URL` do `.env` na raiz.

## Scripts disponíveis

Rodados a partir da raiz do monorepo:

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o app web em modo desenvolvimento |
| `npm run dev:worker` | Sobe o worker em modo desenvolvimento |
| `npm run build` | Build de produção de tudo (libs + web + worker) |
| `npm run test` | Roda a suíte de testes automatizados |
| `npm run lint` | Lint do web e do worker |
| `npm run typecheck` | Checagem de tipos de todo o monorepo |
| `npm run db:migrate` | Cria/aplica uma migração Prisma (dev) |
| `npm run db:migrate:deploy` | Aplica migrações pendentes (produção) |
| `npm run db:seed` | Cria o usuário único a partir do `.env` |
| `npm run db:studio` | Abre o Prisma Studio (explorar o banco visualmente) |

## Arquitetura

Monorepo com npm workspaces:

```
apps/web      Next.js 14 (App Router) — painel + API routes
apps/worker   Node.js — worker BullMQ que executa as Linhas de Produção
packages/db   Prisma (schema, migrações, client compartilhado)
packages/shared  Criptografia, sessão, TOTP, clientes de IA (OpenAI/Gemini/
                 Grok/Stability), cliente WordPress, storage, fila BullMQ
```

- **Auth**: usuário único, sessão em cookie httpOnly assinado (JWT), sem NextAuth.
- **Criptografia**: AES-256-GCM para chaves de API e senhas de aplicação WordPress.
- **Fila/Agendamento**: BullMQ sobre Redis — cada linha de produção se auto-reagenda a cada execução; lock por linha e limite de concorrência por provedor de IA via Redis.
- **Storage**: disco local em dev, com abstração pronta para trocar por S3/Supabase.
