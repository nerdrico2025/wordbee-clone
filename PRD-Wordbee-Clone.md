# PRD — App Pessoal de Automação de Artigos para WordPress (Clone Wordbee — Single User)

**Versão:** 1.1
**Data:** 23/08/2026
**Status:** Rascunho para validação

> **Mudança da v1.0 → v1.1:** removidos planos de assinatura, pagamentos (Mercado Pago), quotas e qualquer estrutura multiusuário/SaaS comercial. O app é de **uso pessoal e exclusivo do dono**, com **sites WordPress ilimitados** e **produção ilimitada de artigos**. Os únicos limites reais passam a ser os das APIs de IA (rate limits dos provedores).

---

## 1. Visão Geral do Produto

### 1.1 Resumo
Aplicação web pessoal de automação de conteúdo para blogs WordPress. Transforma uma ideia (tema/nicho) em um artigo completo — título, conteúdo otimizado para SEO e imagem destacada — publicado diretamente em qualquer um dos blogs WordPress do dono via REST API, de forma instantânea (geração unitária) ou contínua e agendada ("Linhas de Produção").

### 1.2 Proposta de Valor
- **Da ideia à publicação em menos de 2 minutos**, sem copiar e colar.
- **Piloto automático 24/7**: linhas de produção geram e publicam artigos em intervalos configuráveis, em quantos blogs forem necessários.
- **BYOK (Bring Your Own Key)**: usa as próprias chaves de IA do dono, com transparência total de consumo.
- **Multi-provedor de IA**: OpenAI, Google Gemini, xAI (Grok) e Stability AI, com seleção independente para texto e imagem.
- **Sem limites artificiais**: blogs ilimitados, artigos ilimitados, linhas ilimitadas.

### 1.3 Usuário
Um único usuário: o dono da aplicação (administrador), gerenciando o próprio portfólio de blogs (nichos próprios e/ou de projetos pessoais). Não há cadastro público, não há convites, não há papéis.

### 1.4 Métricas de Sucesso
- Artigos publicados com sucesso por mês por linha e no total.
- Taxa de sucesso de publicação (publicações OK ÷ tentativas) ≥ 99%.
- Tempo médio de geração + publicação ≤ 2 min por artigo.
- Zero artigos duplicados por falha de agendamento/retry.

---

## 2. Escopo

### 2.1 Dentro do escopo (MVP)
1. Autenticação simples de usuário único (login protegido; sem cadastro público).
2. Dashboard com métricas de produção (sem card de plano/quota).
3. Gerenciamento de chaves de API (texto e imagem) com criptografia.
4. Cadastro e gestão **ilimitada** de sites WordPress (com teste de conexão).
5. Gerador rápido de artigo unitário ("Criar Artigo").
6. Linhas de Produção **ilimitadas** (agendamento em lote) com Fila de Títulos.
7. Histórico de artigos com link para o blog e reenvio em falha.

### 2.2 Fora do escopo
- Planos, assinaturas, pagamentos, quotas e qualquer lógica de billing. ❌ (removido)
- Multiusuário, times, papéis e permissões. ❌ (removido)
- Landing page comercial pública. ❌ (removido — pode existir só uma tela de login)
- Integração com CMS além do WordPress (fase 2: Ghost, Shopify Blog, Medium).
- Editor de artigos interno (revisão antes de publicar dentro da plataforma).
- Pesquisa de palavras-chave / integração com Google Search Console.

---

## 3. Arquitetura de Módulos e Requisitos Funcionais

### 3.1 Autenticação e Perfil (single user)
- **RF-01**: Login com e-mail/senha (credenciais únicas definidas na instalação via variável de ambiente ou seed). Sem página de cadastro. Opcional: 2FA (TOTP) por ser um app exposto na web com credenciais sensíveis armazenadas.
- **RF-02**: Página "Perfil": nome de exibição, troca de senha, sessões ativas.
- **RF-03**: Saudação personalizada no topo do painel ("Olá, {nome} 👋").
- **RF-04**: Tema claro/escuro (toggle no topo direito). Padrão: dashboard claro com menu lateral escuro roxo/grafite. Linguagem simples e acessível em toda a interface.

### 3.2 Dashboard
- **RF-05**: Card de destaque (gradiente roxo) com **resumo de produção do mês**: total de artigos publicados no mês, artigos agendados nas próximas 24h e linhas ativas. *(Substitui o antigo card de plano/quota.)*
- **RF-06**: Três cards de métricas: **Total publicados**, **Publicados este mês**, **Sites cadastrados**.
- **RF-07**: Bloco "Ações rápidas": Gerar artigo agora · Gerenciar sites WordPress · Configurar IAs (muda para "IAs configuradas" quando há chave salva) · Ver histórico.
- **RF-08**: Bloco "Últimos artigos": lista dos artigos recentes com título, tipo, site de destino e link externo; estado vazio: "Você ainda não publicou nenhum artigo."

### 3.3 Chaves de API (BYOK)
- **RF-09**: Duas abas: **IAs para Artigos** (texto) e **IAs para Imagens**.
- **RF-10**: Provedores de texto:
  - OpenAI — GPT-4o
  - Gemini — Gemini 2.5 Flash (badge "Gratuito", nota "Gratuito até 1500 req/dia (texto) e 500/dia (imagem)")
  - Grok (xAI) — Grok 2
- **RF-11**: Provedores de imagem:
  - OpenAI — DALL-E 3
  - Gemini — Nano Banana (Gemini 2.5 Flash Image), com suporte a imagens de referência
  - Grok — Grok Imagine
  - Stability AI — Stable Diffusion 3.5
- **RF-12**: Cada card de provedor exibe: nome + modelo, descrição, estado ("⚠ Nenhuma chave configurada" ou chave mascarada), input com placeholder do prefixo (`sk-...`, `AIza...`, `xai-...`), botão de visibilidade (olho), **Salvar** e link "Como obter a chave ↗".
- **RF-13**: Provedor que suporta texto e imagem (OpenAI, Gemini) usa uma única chave para os dois.
- **RF-14 (Segurança)**: Chaves armazenadas com **AES-256-GCM**; nunca exibidas em texto puro após salvas; nunca retornadas integralmente pela API; descriptografia apenas no worker no momento da chamada.
- **RF-15**: Validação da chave no salvamento (chamada de teste ao provedor) com feedback claro.

### 3.4 Sites WordPress (ilimitados)
- **RF-16**: Listagem em cards; estado vazio com CTA "Cadastrar site"; botão "+ Novo site". **Sem limite de quantidade.**
- **RF-17**: Modal "Novo site WordPress": Nome de exibição · URL (`https://...`) · Usuário (perfil **Administrador**) · Senha de aplicação (`xxxx xxxx xxxx xxxx`, toggle de visibilidade) — com dica "Gere em WordPress → Usuários → Perfil → Senhas de aplicação."
- **RF-18**: Card do site: nome, URL, usuário e ações **Testar** (valida via `/wp-json/wp/v2/users/me`), **Editar**, **Excluir** (com confirmação e aviso se houver linhas ativas apontando para o site).
- **RF-19**: Busca/filtro por nome quando houver muitos sites (a lista pode crescer bastante sem limite).
- **RF-20**: Senha de aplicação armazenada criptografada (AES-256-GCM).

### 3.5 Criar Artigo (Gerador Rápido)
- **RF-21**: Fluxo unitário: site + categoria, IA de texto, IA de imagem, tipo de artigo, tema, título (sugerido por IA e editável), prompt customizado opcional e status (Publicado/Rascunho).
- **RF-22**: Progresso visível (título → conteúdo → imagem → publicando) e link "Ver no blog" ao final.
- **RF-23**: **Sem consumo de quota** — geração livre. Erros de rate limit do provedor de IA são exibidos com orientação (ex.: "Limite diário do Gemini gratuito atingido, tente outro provedor ou aguarde").

### 3.6 Linhas de Produção (ilimitadas)
- **RF-24**: Listagem com estado vazio ("Nenhuma linha de produção" + CTA "Criar Primeira Linha") e botão "+ Nova Linha". **Sem limite de linhas simultâneas.**
- **RF-25**: Modal "Nova Linha de Produção":
  | Campo | Regras |
  |---|---|
  | Nome da linha * | Identificador interno (ex.: "Dicas de crédito") |
  | Site WordPress * | Select dos sites cadastrados |
  | Categoria (opc.) | Carregada dinamicamente via REST API do site selecionado ("Carregando…") |
  | IA para Texto * | Select entre provedores com chave configurada |
  | IA para Imagem * | Select entre provedores com chave configurada |
  | Tipo de artigo * | 14 opções: Receita, Tutorial, Passo a Passo, Notícias, Novidades, Curiosidades, Opinião, Reviews, Guia Completo, Comparativo, Lista/Listicle, FAQ, Análise, Estudo de Caso |
  | Tema / Nicho * | Múltiplos tópicos separados por vírgula |
  | Intervalo * | A cada 10, 15, 20, 30, 45 min · 1h, 2h, 3h, 6h, 12h, 24h (1x por dia) |
  | Máximo de artigos | Limite opcional da linha; **vazio = ilimitado de verdade** (roda até ser pausada) |
  | Status no WordPress | Publicado (default) ou Rascunho |
  | Prompt customizado (opc.) | Instruções adicionais para o modelo |
  | Imagens de Referência (opc.) | Até 5 imagens para guiar a direção de arte (funciona melhor com Gemini) |
- **RF-26**: Card da linha: nome, badge **Ativa/Pausada**, site, tipo, intervalo, progresso ("2/5" ou "12/∞"), temas, "Último: {data}" · "Próximo: {data/hora}", ações **Pausar/Retomar** e **Excluir**.
- **RF-27 — Página de detalhe da linha**:
  - Cabeçalho com metadados e botão "Atualizar";
  - **Imagens de Referência** (galeria, máx. 5);
  - **Fila de Títulos**: títulos futuros com horário previsto; botão "Gerar Títulos"; título clicável e **editável antes da publicação**; novos títulos gerados automaticamente após cada artigo publicado;
  - **Artigos Publicados**: lista com título, data/hora e "Ver no blog ↗".
- **RF-28**: A linha respeita apenas: máximo da linha (se definido) → intervalo. Ao atingir o máximo, pausa automaticamente com o motivo registrado. *(Sem verificação de quota de plano.)*
- **RF-29**: Execução resiliente: retry com backoff (3 tentativas) para falhas de IA ou WordPress; falha vai ao Histórico com ação de reenvio. Tratamento explícito de rate limit dos provedores: pausar a linha com aviso ou adiar o próximo disparo, configurável.
- **RF-30**: Proteção de concorrência: com muitas linhas ativas, o agendador limita execuções simultâneas por provedor de IA (configurável, ex.: 3 jobs paralelos) para não estourar rate limits.

### 3.7 Histórico
- **RF-31**: Lista completa: título, site, tipo, origem (linha ou manual), data, status (Publicado, Rascunho, Falha, Processando) e link "Ver no blog".
- **RF-32**: **Reenviar** para artigos com falha.
- **RF-33**: Filtros por site, status, linha e período; busca por título. Paginação preparada para volume alto (produção ilimitada).

---

## 4. Pipeline de Geração de Artigo (fluxo técnico)

1. **Trigger**: scheduler da linha (intervalo) ou ação manual.
2. **Verificações**: máximo da linha (se houver), chave de IA válida, site conectado. *(Sem checagem de quota.)*
3. **Título**: consome o próximo da Fila (ou gera novo com base em tema + tipo, evitando duplicados já publicados na linha).
4. **Conteúdo**: prompt estruturado por tipo de artigo + tema sorteado da lista + prompt customizado. Saída em HTML compatível com Gutenberg, com H2/H3, listas e SEO básico (meta title ≤ 60 chars, slug, excerpt).
5. **Imagem destacada**: geração via provedor selecionado; imagens de referência incluídas quando houver (Gemini). Upload via `/wp-json/wp/v2/media` e vínculo como `featured_media`.
6. **Publicação**: `POST /wp-json/wp/v2/posts` com status configurado, categoria e autor da credencial.
7. **Pós-processamento**: registro no Histórico, atualização de "Último/Próximo", geração de novo título para a fila.
8. **Falhas**: retry com backoff; ao esgotar, status "Falha" com mensagem legível e destaque no painel.

---

## 5. Modelo de Dados (alto nível)

> Sem tabelas de assinatura/pagamento. `user_id` mantido nas tabelas por higiene de schema, mas o sistema opera com um único registro em `users`.

- **users** (id, nome, email, senha_hash, tema_ui, totp_secret?, created_at) — 1 registro
- **api_keys** (id, provedor, tipo[texto|imagem|ambos], chave_encrypted, iv, status_validacao, last_validated_at)
- **wp_sites** (id, nome, url, usuario, app_password_encrypted, iv, last_test_at, last_test_ok)
- **production_lines** (id, wp_site_id, nome, categoria_wp_id, ia_texto, ia_imagem, tipo_artigo, temas[], intervalo_min, max_artigos?, gerados_count, status_wp[publish|draft], prompt_customizado, status[ativa|pausada|concluida], next_run_at, last_run_at)
- **line_reference_images** (id, line_id, storage_url, ordem) — máx. 5
- **title_queue** (id, line_id, titulo, previsto_para, status[na_fila|usado|descartado])
- **articles** (id, line_id?, wp_site_id, titulo, tipo, status[processando|publicado|rascunho|falha], wp_post_id, wp_url, erro_msg, created_at, published_at)

---

## 6. Requisitos Não Funcionais

| Categoria | Requisito |
|---|---|
| Segurança | App atrás de login obrigatório (single user) + 2FA opcional; AES-256-GCM para chaves e senhas de aplicação; chave-mestra em variável segura/KMS; TLS; rate limiting no login; senhas com bcrypt/argon2 |
| Confiabilidade | Fila de jobs idempotente (nenhum artigo duplicado por retry); dead-letter queue; agendador com lock por linha |
| Performance | Geração + publicação ≤ 2 min p95; dashboard ≤ 1s |
| Escalabilidade pessoal | Suportar dezenas de linhas ativas e dezenas de sites sem degradação; limite de concorrência por provedor configurável |
| Observabilidade | Logs por job, métricas de sucesso/falha por provedor e por linha, alerta visual no painel quando uma linha falha repetidamente |
| Custo | Infra mínima (app roda em 1 instância + Redis + Postgres); sem serviços de billing |
| Acessibilidade | Linguagem simples; contraste AA; navegação por teclado; modo claro como padrão |

---

## 7. Stack Tecnológica Sugerida

- **Frontend**: Next.js (App Router) + Tailwind CSS. Sidebar escura roxo/grafite, dashboard claro, gradientes roxos nos destaques.
- **Backend**: Node.js (NestJS ou Fastify) — alternativas: Python/Go.
- **Filas/Agendamento**: Redis + BullMQ (repeatable jobs por linha + limite de concorrência por provedor).
- **Banco**: PostgreSQL (Supabase ou equivalente).
- **Storage**: S3-compatível (ou Supabase Storage) para imagens de referência.
- **Infra**: Vercel (front) + 1 worker (Railway/Fly) — ou tudo em um VPS único, já que é uso pessoal.

---

## 8. Fluxos Principais

1. **Setup inicial**: login → configurar chave de IA (Gemini grátis como caminho rápido) → cadastrar 1º site WP → gerar 1º artigo.
2. **Automação**: criar linha → gerar títulos → linha publica no intervalo → acompanhar fila e publicados no detalhe.
3. **Escala pessoal**: replicar linhas para novos blogs/nichos sem qualquer limite; monitorar tudo pelo dashboard.
4. **Falha e recuperação**: artigo falha → Histórico → corrigir causa (ex.: nova chave, site fora do ar) → Reenviar.

---

## 9. Critérios de Aceite do MVP (amostra)

- [ ] Com chave Gemini cadastrada, gerar e publicar artigo em site WP real em ≤ 2 min.
- [ ] Linha com intervalo de 10 min e máximo 5 publica exatamente 5 artigos e pausa sozinha.
- [ ] Linha com máximo vazio continua publicando indefinidamente até ser pausada manualmente.
- [ ] É possível cadastrar 15+ sites e criar 15+ linhas sem qualquer bloqueio ou aviso de limite.
- [ ] Título da fila editado é o título usado na publicação.
- [ ] Teste de conexão detecta senha de aplicação inválida com mensagem clara.
- [ ] Chave de API nunca aparece em texto puro em resposta de API, log ou tela.
- [ ] Nenhuma tela, rota ou tabela de planos/pagamento existe no sistema.
- [ ] Acesso sem login é impossível em todas as rotas do painel e da API.

---

## 10. Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| Rate limits dos provedores de IA com muitas linhas ativas | Limite de concorrência por provedor; opção de adiar disparo ou pausar linha com aviso; distribuir linhas entre provedores |
| Mudança/deprecação de modelos de IA | Camada de abstração por provedor; modelos configuráveis por env |
| App pessoal exposto na web com credenciais sensíveis | Login obrigatório + 2FA, rate limit no login, opção de restringir por IP/VPN |
| Bloqueio por hosts WordPress (WAF/rate limit) | Espaçamento entre requests, user-agent identificável, retries com backoff |
| Conteúdo duplicado em produção ilimitada | Checagem de duplicidade de título por linha; variação de temas; prompt customizado |

---

## 11. Roadmap Pós-MVP

1. Editor interno de revisão antes da publicação + reescrita com IA.
2. Interlinking automático entre artigos do mesmo site e SEO avançado (Rank Math/Yoast).
3. Calendário editorial (dias/horários específicos em vez de intervalo fixo).
4. Painel de custos estimados por provedor (tokens/imagens consumidos).
5. Multi-idioma de geração e tradução de artigos.
6. Novos provedores (Claude/Anthropic, DeepSeek) e novos destinos (Ghost, Shopify).
