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
- [Distribuição: levar os artigos até as pessoas](#distribuição-levar-os-artigos-até-as-pessoas)
- [Deploy: EasyPanel (worker) + Neon (Postgres) + Upstash (Redis)](#deploy-easypanel-worker--neon-postgres--upstash-redis)
- [Deploy no VPS sem EasyPanel (fallback)](#deploy-no-vps-sem-easypanel-fallback)
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
| `WORKER_CONCURRENCY` | Linhas reivindicadas/processadas em paralelo por tick do scheduler | Padrão `5` |
| `SCHEDULER_INTERVAL_MS` | Intervalo do polling cron+Postgres do worker | Padrão `90000` (1.5min) — ver DECISIONS.md "scheduler cron+Postgres" |
| `LINE_LOCK_STALE_MS` | Quando um lock de execução travado é considerado morto | Padrão `1200000` (20min) |
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

## Distribuição: levar os artigos até as pessoas

Publicar o artigo é metade do trabalho; a outra metade é alguém chegar até ele. O módulo de Distribuição pega cada artigo publicado e monta um **pacote** (imagem + texto do post + texto do primeiro comentário, com o link), que segue por dois caminhos:

| | Trilho automático | Trilho assistido |
|---|---|---|
| Onde | **Páginas** do Facebook que você administra | **Grupos** do Facebook e perfis pessoais |
| Como | O worker publica sozinho, pela API oficial da Meta | O app monta a fila do dia; **uma pessoa real posta à mão** |
| Por quê | Existe API oficial e sancionada para Páginas | A API de Grupos foi descontinuada pela Meta em 2024 |

> **Por que o app não posta em grupos sozinho.** Não existe caminho oficial, e todo caminho não-oficial (Plubie, ixBrowser e equivalentes) automatiza a **sessão de navegador de uma conta pessoal** — o que viola os Termos da Meta e põe em risco de banimento a conta real de uma pessoa real. Essa decisão é **definitiva**, não uma pendência: ver `DECISIONS.md`, seção "⛔ Decisão permanente de escopo".

### 1. Cadastrar uma Página do Facebook (trilho automático)

Você precisa de duas coisas: o **ID da Página** e um **token de acesso de Página**.

**ID da Página**: no Facebook, abra sua Página → **Configurações → Sobre** (ou "Transparência da Página") → copie a **Identificação da Página**. É só números.

**Token de Página**: o caminho é gerar um token curto de **usuário**, trocá-lo por um de longa duração e, com ele, pedir os tokens das Páginas. O token de Página que sai desse processo **não expira**.

Antes de começar, tenha em mãos o **ID** e a **chave secreta** do seu app: no painel da Meta, **Configurações → Básico** (`SEU_APP_ID` e `SEU_APP_SECRET`). Os exemplos usam `v21.0`, que é o padrão do projeto — se você mudou `FACEBOOK_GRAPH_VERSION` no `.env`, use a mesma versão aqui.

**Passo 1 — token curto de usuário.**

1. Acesse [developers.facebook.com](https://developers.facebook.com) e crie um app (tipo "Empresa/Business"), se ainda não tiver.
2. Abra **Ferramentas → Explorador da API Graph** (Graph API Explorer).
3. Em **Aplicativo da Meta**, escolha seu app. Em **Usuário ou Página**, deixe **Token de acesso do usuário**.
4. Adicione as permissões `pages_manage_posts` (publicar), `pages_read_engagement` e `pages_show_list` (listar suas Páginas).
5. Clique em **Gerar token de acesso**, autorize e copie o token — é o `SEU_TOKEN_CURTO`. Ele vale ~1 hora, só o suficiente para o passo 2.

**Passo 2 — trocar por um token de usuário de longa duração (~60 dias).**

```bash
curl -G "https://graph.facebook.com/v21.0/oauth/access_token" \
  --data-urlencode "grant_type=fb_exchange_token" \
  --data-urlencode "client_id=SEU_APP_ID" \
  --data-urlencode "client_secret=SEU_APP_SECRET" \
  --data-urlencode "fb_exchange_token=SEU_TOKEN_CURTO"
```

A resposta traz o token longo em `access_token`:

```json
{ "access_token": "EAAG...", "token_type": "bearer", "expires_in": 5183944 }
```

Guarde esse valor como `SEU_TOKEN_LONGO`.

**Passo 3 — pegar o token de cada Página.**

```bash
curl -G "https://graph.facebook.com/v21.0/me/accounts" \
  --data-urlencode "access_token=SEU_TOKEN_LONGO"
```

A resposta lista **todas as Páginas que essa conta administra**, cada uma já com o próprio `id` e o próprio `access_token`:

```json
{
  "data": [
    { "name": "Receitas da Vovó", "id": "102938475610293", "access_token": "EAAG..." },
    { "name": "Doces Fáceis",     "id": "998877665544332", "access_token": "EAAG..." }
  ]
}
```

O `id` e o `access_token` de cada item são exatamente o que o Wordbee pede no cadastro — inclusive o `id`, que dispensa procurar a Identificação da Página no painel do Facebook.

> ✅ **Os tokens de Página do passo 3 não têm expiração própria.** Eles continuam válidos indefinidamente, mesmo depois que o token de usuário de 60 dias vencer — o vencimento dele não derruba os tokens de Página já obtidos. Você só precisa repetir os passos 1–3 se criar uma **Página nova** depois que o token de usuário expirar, e mesmo assim só para pegar o token dessa Página nova: as Páginas já cadastradas continuam funcionando sem nenhuma ação.

**Passo 4 — cadastrar no Wordbee.**

1. Vá em **Páginas do Facebook → + Nova Página**. Preencha o nome de exibição, cole o `id` e o `access_token` daquela Página (do passo 3). Opcionalmente vincule a Página a um blog — assim ela só recebe artigos daquele site (sem vínculo, recebe de todos).
2. Ao salvar, o Wordbee **testa o token na API real antes de gravar**: token errado não é salvo. O token fica criptografado (AES-256-GCM) e nunca mais aparece em tela, resposta de API ou log — só a máscara (`EAA...4a2f`).

**Se um token de Página for invalidado** — o que não acontece por expiração, mas acontece se você trocar a senha do Facebook, remover o app, revogar as permissões ou perder o papel de administrador da Página —, a publicação falha, o Wordbee marca a Página como inválida e ela para de receber novos agendamentos (para não empilhar falhas). O Dashboard e o Painel de Distribuição avisam. Refaça os passos 1–3 para obter um token novo, edite a Página e cole — deixar o campo em branco mantém o token atual.

### 2. Cadastrar perfis e grupos parceiros (trilho assistido)

**Perfis de Divulgação** são as pessoas reais (família, parceiros) que ajudam postando nos grupos de que já participam. Um perfil aqui é **só um nome e uma observação** — o Wordbee não guarda login, senha nem sessão de ninguém, e nunca posta no lugar de uma pessoa. É uma agenda de a quem atribuir cada tarefa, não um acesso.

**Grupos Parceiros → + Novo grupo**: nome, link, administrador/contato, valor da parceria (0 = sem pagamento), vigência, nº aproximado de membros e status.

- Marque **"O dono do grupo avisa aos membros que existe uma parceria/publicidade"** quando for verdade. É essa transparência que separa publicidade legítima de publicidade velada (CDC/CONAR) — enquanto não marcada, o card mostra um aviso.
- Em **Perfis do grupo**, vincule quem participa daquele grupo. Só perfis com situação **Aprovado** ou **Já está no grupo** podem receber tarefa de postagem nele — o app não tem (nem deve ter) como fazer alguém entrar num grupo.

### 3. Criar e distribuir um pacote

Um pacote é criado **automaticamente** para cada artigo publicado, desde que exista pelo menos uma Página elegível ou um perfil de divulgação ativo. Você também pode criar um à mão em **Pacotes → + Novo pacote**:

- **Tipo**: *Captação* (o comentário leva ao artigo) ou *Direto pro site* (leva à página de busca do blog pelo tema). O segundo só fica disponível quando o tema já tem **3+ artigos publicados** — mandar tráfego para uma busca com um artigo só entrega uma página quase vazia.
- **Imagens**: 1 reaproveita a imagem do artigo (sem custo de IA); 2 a 6 geram um **álbum** de fotos novas do mesmo tema, com enquadramentos variados.

O worker monta o pacote nos minutos seguintes (texto e imagens). Quando ficar **Pronto**, o card mostra as imagens e as duas copies, com botão de copiar em cada uma. Se a IA gerou variações de texto, dá para trocar a versão ativa sem gastar outra chamada.

Em **Distribuir nos grupos**, escolha as combinações pessoa × grupo e o dia. O app aplica as regras sozinho:

- só perfis ativos, em grupos com parceria ativa, onde a pessoa já está dentro;
- **o mesmo perfil não posta duas vezes no mesmo grupo no mesmo dia** (garantido no banco, não só na tela);
- cada combinação ganha um **link curto rastreado** (`/r/abc12xyz`), que é o que permite saber depois qual grupo converte.

Combinações inválidas não derrubam a operação: entram as válidas e o app diz quais ficaram de fora e por quê.

### 4. O dia a dia na Fila de Distribuição

**Fila de Distribuição** é a tela de trabalho. Mostra o dia agrupado por pessoa; cada item traz o grupo, a imagem, o **texto do post** e o **primeiro comentário já com o link curto daquela combinação**.

O fluxo, por item:

1. Salve a imagem (clique nela para abrir em tamanho real).
2. **Copiar** o texto do post → publique no grupo com a imagem.
3. **Copiar** o comentário → cole como primeiro comentário do seu próprio post.
4. Clique em **Marcar como postado** (ou **Pular hoje**, se não deu).

Filtros por dia, pessoa, grupo e status. O contador no topo mostra quantas das tarefas do dia já saíram.

### 5. Acompanhar o que está funcionando

**Painel de Distribuição** responde a pergunta que decide onde investir:

- publicações automáticas por Página nos últimos 7 dias (sucessos, falhas, agendadas), com aviso de token inválido;
- fila de hoje: quantas concluídas de quantas;
- **cliques por grupo e por perfil** — qual parceria realmente traz gente, e quanto cada pessoa está trazendo;
- **capacidade da estrutura atual** (pacotes/dia × perfis ativos × grupos por perfil), comparada ao realizado. É o teto que a estrutura comporta, **não** uma meta: cadência humana real é sempre menor, e forçar o teto é o que faz um perfil real ser sinalizado como spam.

Duas variáveis de ambiente opcionais afetam esta área (ver `.env.example`): `APP_PUBLIC_URL` (base dos links curtos — sem ela, o app deriva dos headers da requisição) e `APP_TIMEZONE` (fuso usado para decidir "que dia é hoje" na fila; padrão `America/Sao_Paulo`).

## Deploy: EasyPanel (worker) + Neon (Postgres) + Upstash (Redis)

**Estado atual de produção (validado de ponta a ponta em 2026-08-25): dois ambientes de deploy coordenados, sem Railway.**

| Peça | Onde roda | Observação |
|---|---|---|
| **web** (Next.js) | **Vercel** (serverless) | Só escreve `status`/`nextRunAt` direto no Postgres ao criar/pausar/retomar/excluir uma linha — não agenda nada em fila nenhuma (ver DECISIONS.md "scheduler cron+Postgres") |
| **worker** (cron+Postgres) | **EasyPanel**, serviço "App" único, Docker no VPS próprio | Faz polling periódico no Postgres (linhas ATIVA com `nextRunAt` vencido) e processa; único serviço que roda no VPS — sem Postgres nem Redis locais |
| **Postgres** | **Neon** (gerenciado, externo) | Mesma instância para web e worker — `DATABASE_URL` idêntica nos dois ambientes; também é a fonte de verdade do agendamento (`nextRunAt`) e do lock de execução por linha |
| **Redis** | **Upstash** (gerenciado, externo) | Mesma instância para web e worker — `REDIS_URL` idêntica nos dois ambientes; rate limit de login (só web), semáforo de concorrência por provedor de IA (só worker) e heartbeat de saúde do worker (escrito pelo worker, lido pelo web) |

Não é um deploy único: são **dois ambientes de produção** (Vercel e EasyPanel) que **compartilham** dois serviços de dados externos (Neon e Upstash) em vez de cada um ter os seus. Railway foi totalmente descontinuada — nenhum serviço (web, worker, Postgres ou Redis) roda mais lá; ver `DECISIONS.md` ("Estado final da infraestrutura de produção — Railway descontinuada").

> ⚠️ **Por que Postgres e Redis são serviços externos (Neon/Upstash) em vez de rodarem no próprio VPS/EasyPanel**: o web (Vercel) é **serverless com IP de saída dinâmico/não fixo** — ele não consegue depender de forma confiável de um banco ou Redis que só aceite conexões de uma rede privada ou de IPs fixos (regra de firewall por IP não serve para IP dinâmico, e deixar a porta aberta pra qualquer IP de origem é um risco desnecessário para expor dados de produção). Neon e Upstash são desenhados exatamente para esse padrão — endpoint público com TLS, otimizados para clientes serverless/edge. Isso também simplifica o VPS: o EasyPanel só precisa rodar o container do worker (stateless), sem Postgres/Redis para fazer backup, atualizar de versão ou proteger localmente.
>
> **Consequência prática**: `DATABASE_URL` e `REDIS_URL` do web (Vercel) e do worker (EasyPanel) precisam ser **literalmente o mesmo valor** nos dois ambientes — não "a mesma instância acessada por endereços diferentes", o mesmo texto de connection string. Se `DATABASE_URL` divergir, o web escreve `nextRunAt`/`status` num banco que o worker nunca lê, e a linha de produção nunca dispara. Se `REDIS_URL` divergir, o sintoma é mais discreto (rate limit de login e badge de saúde do worker no Dashboard passam a se comportar errado), mas o agendamento em si continua funcionando — desde a migração para cron+Postgres, o Redis não é mais crítico pro disparo das linhas em si.

> O `docker-compose.prod.yml` deste repo **não** é usado em produção — ele existe só para testar localmente (`docker compose -f docker-compose.prod.yml up -d --build`, com Postgres/Redis locais nesse cenário de teste) e como fallback documentado pra quem preferir hospedar Postgres/Redis no próprio VPS em vez de Neon/Upstash (seção seguinte, com os mesmos avisos de IP dinâmico da Vercel).

### Variáveis que você precisa ter em mãos

- A **`ENCRYPTION_KEY`** de produção (a mesma configurada hoje na Vercel — copie do painel: Settings → Environment Variables). **Nunca gere uma nova** nem deixe divergir entre Vercel e EasyPanel: é ela que descriptografa `api_keys.chave_encrypted` e `wp_sites.app_password_encrypted` no Postgres (Neon); se divergir, esses dados ficam ilegíveis sem erro visível na hora, só na primeira tentativa de uso.
- A **connection string do Neon** (Postgres) — mesmo valor de `DATABASE_URL` nos dois ambientes.
- A **connection string TCP do Upstash** (`rediss://...`, não a REST URL — `ioredis` precisa do protocolo Redis nativo) — mesmo valor de `REDIS_URL` nos dois ambientes.
- O `SESSION_SECRET` da Vercel (só o web usa; não precisa no worker).

### Passo a passo (setup do zero, ou recriar o ambiente)

**1. Neon (Postgres)**

- Crie um projeto no [Neon](https://neon.tech) (plano gratuito é suficiente para uso pessoal) e copie a connection string do endpoint **pooled** (`-pooler`, `postgresql://usuario:senha@host-pooler/banco?sslmode=require`). É pública por padrão (feito pra ser acessado de qualquer lugar com TLS) — use o mesmo valor em `DATABASE_URL` na Vercel e no worker do EasyPanel.
- **Adicione `&pgbouncer=true&connection_limit=10`** ao final da connection string (nos dois ambientes) — o pooler do Neon é baseado em PgBouncer (modo *transaction*), e o Prisma, por padrão, usa *prepared statements* (protocolo estendido) que não são seguros sobre esse tipo de pooler: sem essa flag, o Prisma pode reutilizar/colidir com uma prepared statement de uma conexão física diferente (reciclada pelo pooler entre transações), causando erros confusos e intermitentes — inclusive `column "..." does not exist` para uma coluna que existe de verdade, se alguma prepared statement antiga (de antes de uma migração) ficar presa numa conexão física que o pooler reaproveita depois. `connection_limit=10` é uma estimativa razoável para o worker (que processa até `WORKER_CONCURRENCY` linhas em paralelo por tick, cada uma podendo abrir sua própria query) — ajuste se necessário. Ver `DECISIONS.md` ("Investigação: worker travado com coluna inexistente apesar de migração aplicada", 2026-08-31).

**2. Upstash (Redis)**

- Crie um banco Redis no [Upstash](https://upstash.com) (plano gratuito é suficiente para uso pessoal) e copie a **connection string TCP** (`rediss://default:senha@host:porta`). Mesmo valor em `REDIS_URL` na Vercel e no worker do EasyPanel — ver aviso acima sobre por que precisa ser idêntica.

**3. Projeto novo no EasyPanel**

- No painel do EasyPanel, crie um **Project** novo (ex.: `wordbee-clone`).

**4. Worker (App a partir do GitHub)**

- **+ Service → App**.
- **Source**: conecte o repositório do GitHub deste projeto.
- **Build**: tipo Dockerfile, caminho `apps/worker/Dockerfile`, **contexto de build = raiz do repositório** (não `apps/worker/`) — o Dockerfile copia `package.json`/`packages/*` da raiz do monorepo.
- **Sem porta exposta e sem domínio**: o worker não sobe servidor HTTP (só faz polling no Postgres), então não marque "Expose" nem configure domínio/SSL para esse serviço.
- **Variáveis de ambiente** do serviço worker (ver `.env.production.example` para a lista completa e comentada):
  - `DATABASE_URL` → connection string do **Neon** (passo 1) — idêntica à da Vercel
  - `REDIS_URL` → connection string do **Upstash** (passo 2) — idêntica à da Vercel
  - `ENCRYPTION_KEY` → **a mesma chave que já está na Vercel** (não gere uma nova)
  - `STORAGE_DRIVER=local`, `STORAGE_LOCAL_PATH=/repo/storage/uploads`
  - `AI_PROVIDER_CONCURRENCY`, `WORKER_CONCURRENCY` (opcionais, padrões `3`/`5`)
  - Overrides de modelo de IA (`OPENAI_TEXT_MODEL` etc.), se você usa algum diferente do padrão — mantenha iguais aos já configurados na Vercel.
- **Volume persistente**: monte um volume em `/repo/storage/uploads` (Storage → Volumes do serviço) — mesmo caminho de `STORAGE_LOCAL_PATH` acima.
- Faça o deploy do serviço.

**5. Rodar a migração e (só num banco novo) o seed**

Pelo terminal do serviço worker no próprio EasyPanel (ou via SSH no VPS + `docker exec` no container), rode:

```bash
cd packages/db && npx prisma migrate deploy
```

O seed (`npx tsx prisma/seed.ts`) só é necessário se for um banco **novo, vazio** — o usuário único já existe no Neon de produção atual.

**6. Vercel (app web)**

No painel da Vercel (Settings → Environment Variables do projeto web), confirme que `DATABASE_URL`, `REDIS_URL` e `ENCRYPTION_KEY` são **literalmente os mesmos valores** configurados no worker (passo 4). Ver `VERCEL-ENV.md` para a lista completa de variáveis do lado web (`SESSION_SECRET`, `SESSION_TTL_HOURS` etc., que não vão no worker).

**7. Validar de ponta a ponta**

Teste real, não só "o worker está de pé": crie ou edite uma Linha de Produção pelo app web e confirme nos logs do worker (EasyPanel) que o job correspondente foi consumido (`[worker] linha=<id> evento=...` — ver "Como acompanhar os logs do worker" abaixo). Se o job nunca aparecer nos logs do worker, é sinal de que `REDIS_URL` diverge entre Vercel e EasyPanel — confira os dois valores literalmente, caractere a caractere, antes de qualquer outra investigação.

### Atualizar depois de um `git push`

O serviço worker no EasyPanel pode ser configurado com deploy automático no push (mesma configuração de "Source" do passo 4) ou redeploy manual pelo botão do painel.

> ⚠️ **Ordem importa quando a mudança inclui migração de schema nova**: aplique a migração contra o Postgres de produção **ANTES** de fazer deploy do código novo no web (Vercel) e no worker (EasyPanel), nessa ordem — não depois, não em paralelo. Colunas novas *nullable* são seguras de adicionar enquanto o código antigo ainda está rodando (ele simplesmente as ignora); o inverso — código novo já deployado esperando uma coluna que ainda não existe — não é seguro e derruba tanto a página que fizer aquela query quanto o worker, silenciosamente. Isso já aconteceu de verdade em produção (ver `DECISIONS.md` "Incidente: migração do scheduler cron+Postgres deployada em código sem a migração de schema correspondente", 2026-08-30) — a Vercel, o EasyPanel e o Neon são três deploys independentes, nenhum deles aplica migração pelo outro.
>
> Depois de rodar a migração, confirme com `prisma migrate status` (contra o `DATABASE_URL` real de produção) que não sobrou nada pendente — antes de considerar o deploy concluído, não só depois de ver algum erro.

```bash
cd packages/db && npx prisma migrate deploy
# checagem de saída, sempre:
npx prisma migrate status --schema prisma/schema.prisma
```

> ⚠️ **Depois de QUALQUER migração de schema aplicada em produção, reinicie de verdade o container do worker no EasyPanel** (botão "Restart", não só um redeploy que pode não derrubar o processo antigo a tempo) **antes de considerar o deploy concluído** — mesmo com a migração já aplicada e as colunas já existindo no banco, uma conexão do worker aberta antes da migração (via o endpoint `-pooler` do Neon) pode continuar servindo dados/planos de execução presos ao schema anterior por causa de *prepared statements* não isoladas corretamente pelo pooler (ver `&pgbouncer=true` acima). Um restart força o Prisma Client a abrir conexões novas do zero, eliminando essa classe de staleness independentemente da causa exata. Isso já causou um incidente real em produção (`column "locked_at" does not exist` com a migração já aplicada e confirmada) — ver `DECISIONS.md` ("Investigação: worker travado com coluna inexistente apesar de migração aplicada", 2026-08-31).

## Deploy no VPS sem EasyPanel (fallback)

Alternativa para quem prefere gerenciar o VPS diretamente com Docker Compose puro, sem o EasyPanel — sobe **worker + Postgres + Redis** (o app web continua na Vercel; este compose não tem serviço `web`, ver `DECISIONS.md`).

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
#   ENCRYPTION_KEY (a mesma já usada na Vercel — não gere uma nova)
#   STORAGE_LOCAL_PATH=/repo/storage/uploads   <- caminho DENTRO do container

# 3. Suba os containers
docker compose -f docker-compose.prod.yml up -d --build

# 4. Rode a migração do banco (uma vez, e a cada atualização com nova migração)
docker compose -f docker-compose.prod.yml run --rm worker \
  sh -c "cd packages/db && npx prisma migrate deploy"

# 5. Se for um banco novo (não uma migração de dados existentes), rode o seed:
docker compose -f docker-compose.prod.yml run --rm worker \
  sh -c "cd packages/db && npx tsx prisma/seed.ts"
```

Depois, exponha `DATABASE_URL` do Postgres deste compose publicamente (proxy reverso Nginx/Caddy com TLS, ou tunnel) para a Vercel conseguir alcançá-lo, e configure na Vercel.

> ⚠️ **Redis**: o mesmo problema descrito na seção do EasyPanel se aplica aqui — a Vercel tem IP de saída dinâmico, então expor o Redis deste compose só para o IP da Vercel não é confiável, e deixá-lo aberto pra qualquer IP é arriscado. Recomendado: **não** use o serviço `redis` deste compose como o `REDIS_URL` compartilhado com a Vercel — aponte web (Vercel) e worker (este VPS) para uma instância **Upstash** externa, do mesmo jeito descrito na seção do EasyPanel (nesse caso, o serviço `redis` do compose fica sem uso; pode removê-lo do arquivo se for adotar esse caminho definitivamente).

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

Os dois scripts leem `DATABASE_URL` do `.env` na raiz — ou, se `DATABASE_URL` já estiver exportada no ambiente, usam essa em vez de ler o arquivo. Isso permite apontar backup e restore para bancos diferentes sem editar nada (ex.: trocar de provedor de Postgres, restaurar um dump de produção localmente para debugar):

```bash
DATABASE_URL="postgresql://usuario:senha@host-origem/banco" ./scripts/backup.sh backups/migration
DATABASE_URL="postgresql://usuario:senha@host-destino/banco" ./scripts/restore.sh backups/migration/wordbee_TIMESTAMP.dump
```

> ⚠️ **Se o backup vier de um ambiente com `ENCRYPTION_KEY` diferente do destino**: `api_keys.chave_encrypted` e `wp_sites.app_password_encrypted` são criptografados com essa chave (AES-256-GCM). O dump/restore copia os bytes criptografados como estão — se o `ENCRYPTION_KEY` do destino divergir do que gerou esses dados, o app não avisa na hora: ele simplesmente falha ao descriptografar (chaves de API param de funcionar, sites WordPress não autenticam mais) na primeira tentativa de uso. Configure a mesma `ENCRYPTION_KEY` no destino antes de restaurar — nunca gere uma nova como parte desse processo.

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
apps/worker   Node.js — scheduler cron+Postgres que executa as Linhas de Produção
packages/db   Prisma (schema, migrações, client compartilhado)
packages/shared  Criptografia, sessão, TOTP, clientes de IA (OpenAI/Gemini/
                 Grok/Stability), cliente WordPress, storage
```

- **Auth**: usuário único, sessão em cookie httpOnly assinado (JWT), sem NextAuth.
- **Criptografia**: AES-256-GCM para chaves de API e senhas de aplicação WordPress.
- **Agendamento**: cron+Postgres, não BullMQ/Redis (ver DECISIONS.md "scheduler cron+Postgres") — o worker faz polling periódico em `production_lines` (`status='ATIVA' AND next_run_at <= now()`), reivindica linhas via `FOR UPDATE SKIP LOCKED` (lock de execução por linha direto no Postgres) e cada linha se auto-reagenda a cada execução. O limite de concorrência por provedor de IA continua via semáforo Redis (script Lua atômico).
- **Storage**: disco local em dev, com abstração pronta para trocar por S3/Supabase.
