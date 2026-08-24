# Prompts para Claude Code — Build do Clone Wordbee (uso pessoal)

**Como usar:** coloque o arquivo `PRD-Wordbee-Clone.md` na raiz do projeto antes de começar. São **4 prompts sequenciais**, cada um entregando uma fatia funcional inteira. Só há **2 paradas obrigatórias** (marcadas com 🛑) — nos pontos em que o Claude Code precisa de credenciais reais que só você tem. No resto, ele decide sozinho.

---

## PROMPT 0 — Contexto permanente (colar uma vez, no início da sessão)

```
Você vai construir sozinho, do zero ao deploy, uma aplicação web completa. Leia PRD-Wordbee-Clone.md na raiz do projeto — ele é a especificação oficial e a fonte de verdade de escopo.

OBJETIVO: clone fiel do app "Wordbee" (SaaS de geração e publicação automática de artigos em WordPress via IA), porém em versão de USO PESSOAL — usuário único, sem planos, sem pagamentos, sem quotas, com sites e artigos ILIMITADOS.

REGRAS DE TRABALHO (valem para toda a sessão):
1. Autonomia total. Não me peça aprovação de arquitetura, nomes, bibliotecas, estrutura de pastas ou decisões de UI. Escolha, implemente, siga.
2. Só pare e me pergunte quando for IMPOSSÍVEL prosseguir sem um dado que só eu tenho (credenciais reais, chaves de API, URL de blog real). Nesses casos, deixe o código pronto com placeholders/.env.example e siga para a próxima parte — não fique parado.
3. Ambiguidade no PRD: escolha a opção mais próxima dos screenshots do Wordbee e registre a decisão em DECISIONS.md, com uma linha de justificativa. Não me pergunte.
4. Autorrevisão obrigatória ao fim de cada prompt: rode typecheck, lint e build; corrija tudo que quebrar; só então me diga que terminou. Não me entregue código que não compila.
5. Escreva testes automatizados para a lógica crítica (criptografia, agendador, cliente WordPress, pipeline de geração) usando mocks — sem depender de APIs externas reais.
6. Commits pequenos e descritivos conforme avança.
7. Mantenha um PROGRESS.md com o que já está pronto e o que falta, atualizado ao fim de cada prompt.

STACK OBRIGATÓRIA:
- Next.js (App Router, TypeScript) + Tailwind CSS
- PostgreSQL + Prisma (ou Drizzle, sua escolha)
- Redis + BullMQ para filas e agendamento (worker Node separado, no mesmo monorepo)
- Auth própria simples (usuário único, sessão via cookie httpOnly assinado) — sem NextAuth, sem provedores sociais
- Storage local em disco para imagens de referência no dev; abstração trocável por S3/Supabase em prod

IDENTIDADE VISUAL (copiar do Wordbee — os screenshots são a referência):
- Sidebar escura em gradiente roxo/grafite, largura ~256px, logo "WORDBEE" no topo com ícone, label "MENU" acima dos itens, item ativo em roxo sólido com cantos arredondados, bloco do usuário fixo no rodapé da sidebar.
- Menu, nesta ordem: Dashboard · Criar Artigo · Linhas de Produção · Histórico · Sites WordPress · Chaves de API · Perfil. (Sem "Planos" — foi removido do escopo.)
- Área de conteúdo em fundo claro (#FAFAFA/branco), cards brancos com borda sutil e raio ~12px, sombra leve.
- Header fino no topo com "Olá, {nome} 👋" e subtítulo "Bem-vindo ao seu painel", com toggle de tema claro/escuro à direita.
- Roxo primário ~#7C3AED, gradientes roxo→magenta nos cards de destaque, badges verdes para status "Ativa"/"Gratuito", vermelho para ações destrutivas.
- Tipografia sans-serif geométrica, títulos de página grandes e em negrito com subtítulo cinza abaixo.
- Todos os textos da interface em português do Brasil, linguagem simples e direta.
- Modo claro é o padrão. Contraste AA, navegação por teclado funcionando.

Confirme que leu o PRD e comece pelo PROMPT 1, que eu envio em seguida.
```

---

## PROMPT 1 — Fundação: projeto, banco, auth, layout e design system

```
Execute a fundação completa da aplicação. Não pare no meio; entregue tudo funcionando.

1. SCAFFOLD
- Monorepo simples: app Next.js (web) + worker Node (BullMQ) compartilhando o mesmo schema de banco e uma pasta de código comum (tipos, cliente de banco, criptografia, clientes de IA, cliente WordPress).
- Docker Compose para Postgres e Redis no dev. Scripts npm: dev, dev:worker, build, test, lint, typecheck, db:migrate, db:seed.
- .env.example completo e documentado.

2. BANCO DE DADOS
- Implemente todas as tabelas da seção 5 do PRD: users, api_keys, wp_sites, production_lines, line_reference_images, title_queue, articles.
- Índices para as consultas quentes: articles por data e por linha, production_lines por next_run_at e status, title_queue por linha e status.
- Seed que cria o usuário único a partir de ADMIN_EMAIL e ADMIN_PASSWORD do .env (senha com argon2 ou bcrypt).

3. CRIPTOGRAFIA (crítico — cubra com testes)
- Módulo de cripto AES-256-GCM com chave-mestra vinda de ENCRYPTION_KEY (32 bytes, base64), IV aleatório por registro, authTag persistido.
- Usado para: chaves de API dos provedores e senhas de aplicação do WordPress.
- Nunca retorne o valor decifrado em nenhuma resposta de API. Exponha apenas máscara (ex.: "sk-...4a2f") e um booleano "configurada".
- Testes: round-trip, falha em authTag adulterado, garantia de que serializações do objeto não vazam o texto puro.

4. AUTENTICAÇÃO (usuário único)
- Tela de login (roxa, minimalista, alinhada à identidade do app). Sem cadastro público, sem recuperação por e-mail.
- Sessão em cookie httpOnly assinado, com expiração e renovação.
- Middleware protegendo TODAS as rotas do painel e TODAS as rotas de API, exceto /login e o endpoint de autenticação.
- Rate limit no login (ex.: 5 tentativas / 15 min por IP).
- 2FA TOTP opcional: implemente o suporte no backend e a tela de ativação em Perfil, desligado por padrão.

5. LAYOUT E DESIGN SYSTEM
- Shell completo: sidebar + header conforme a identidade descrita no PROMPT 0, responsivo (sidebar vira drawer no mobile).
- Componentes base reutilizáveis: Button (variantes primary/secondary/ghost/destructive), Card, Modal, Input, PasswordInput com toggle de olho, Select, Textarea, Badge, Toast, Skeleton, EmptyState (ícone + título + descrição + CTA), ProgressBar, Tabs, ConfirmDialog.
- Tema claro/escuro com persistência e toggle no header.
- Todos os estados vazios seguem o padrão do Wordbee: ícone grande cinza centralizado, título, uma linha de descrição e botão roxo de ação.

6. PÁGINAS ESQUELETO
- Crie as 7 rotas do menu com layout, título, subtítulo e estado vazio corretos, ainda sem lógica de negócio (exceto Perfil, que já deve funcionar: nome, troca de senha, 2FA, sessões).

Ao terminar: rode typecheck, lint, build e testes; corrija o que falhar; atualize PROGRESS.md e DECISIONS.md; me mostre um resumo curto do que foi feito e como rodar localmente.
```

---

## PROMPT 2 — Chaves de API, Sites WordPress e geração unitária ponta a ponta

```
Implemente as três peças que fazem o primeiro artigo sair publicado. Vá até o fim sem parar.

1. CHAVES DE API (tela idêntica ao Wordbee)
- Página "Chaves de API" com título, subtítulo "Configure suas chaves de IA para gerar artigos e imagens. Todas as chaves são criptografadas (AES-256-GCM)." e duas abas: "IAs para Artigos" e "IAs para Imagens".
- Linha de apoio acima dos cards: "Escolha o provedor de IA para geração de texto dos seus artigos. O Gemini é gratuito!" (e a variante para imagens).
- Cards de TEXTO: OpenAI (GPT-4o) · Gemini (Gemini 2.5 Flash, badge verde "Gratuito" + link "Gratuito até 1500 req/dia (texto) e 500/dia (imagem)") · Grok (Grok 2).
- Cards de IMAGEM: OpenAI (DALL-E 3) · Gemini (Nano Banana — Gemini 2.5 Flash Image, badge "Gratuito") · Grok (Grok Imagine) · Stability AI (Stable Diffusion 3.5, badge "Gratuito" + "Créditos grátis para novos usuários!").
- Cada card: nome + chip do modelo, descrição curta, alerta "⚠ Nenhuma chave configurada" (ou chave mascarada quando salva), input com placeholder do prefixo correto (sk-... / AIza... / xai-...), botão de olho, botão "Salvar", link "Como obter a chave ↗" apontando para a documentação real do provedor.
- Rodapé fixo: box "Segurança das suas chaves" explicando AES-256-GCM e que uma chave de provedor que serve texto e imagem (OpenAI, Gemini) só precisa ser cadastrada uma vez — implemente esse compartilhamento de fato.
- Ao salvar, valide a chave com uma chamada real e barata ao provedor (listar modelos ou completion mínima) e mostre sucesso/erro claro. Persista o resultado da validação.

2. CLIENTES DE IA (camada de abstração)
- Interface única TextProvider { generateTitles, generateArticle } e ImageProvider { generateImage(prompt, referenceImages?) }.
- Implementações: OpenAI, Gemini, xAI/Grok, Stability AI. Nomes de modelo em constantes configuráveis por env.
- Tratamento normalizado de erros: chave inválida, rate limit, timeout, conteúdo bloqueado — cada um com mensagem em português pronta para exibir na UI.
- Se algum endpoint/SDK tiver mudado, consulte a documentação atual do provedor e use a versão correta. Registre em DECISIONS.md.

3. SITES WORDPRESS (ilimitados)
- Página com cards, botão "+ Novo site" no topo direito e estado vazio "Nenhum site cadastrado / Adicione seu primeiro site WordPress para começar" + botão "Cadastrar site".
- Modal "Novo site WordPress": Nome de exibição · URL (https://, validada) · Usuário (dica de que precisa ser Administrador) · Senha de aplicação com máscara "xxxx xxxx xxxx xxxx" e toggle de olho · texto de ajuda "Gere em WordPress → Usuários → Perfil → Senhas de aplicação." · botões Cancelar / Cadastrar.
- Card do site: ícone, nome, URL, "Usuário: x" e ações "Testar", "Editar", "Excluir" (excluir com confirmação e aviso se houver linhas apontando para ele).
- Sem limite de quantidade. Adicione busca por nome quando houver mais de 6 sites.
- Cliente WordPress próprio (REST API v2) com Basic Auth de senha de aplicação: testConnection (users/me + checa capabilities de admin), listCategories, uploadMedia, createPost. Timeouts, retry com backoff e erros traduzidos (site fora do ar, 401, REST API desabilitada, 403 de WAF).

4. GERAÇÃO UNITÁRIA ("Criar Artigo")
- Formulário: Site + Categoria (carregada dinamicamente do site escolhido, com estado "Carregando…") · IA para Texto · IA para Imagem (selects mostrando só provedores com chave válida) · Tipo de artigo (os 14 do PRD) · Tema · Título (botão "Gerar títulos com IA" que sugere opções, e campo livre editável) · Prompt customizado opcional · Status no WordPress (Publicado/Rascunho).
- Pipeline completo conforme seção 4 do PRD: título → conteúdo HTML compatível com Gutenberg (H2/H3, listas, parágrafos, sem markdown cru) → imagem destacada → upload em media → criação do post com featured_media e categoria.
- Prompts de sistema específicos por tipo de artigo (Receita, Tutorial, Passo a Passo, Notícias, Novidades, Curiosidades, Opinião, Reviews, Guia Completo, Comparativo, Lista/Listicle, FAQ, Análise, Estudo de Caso) — cada um com estrutura própria e viés de SEO (título chamativo, intro que engancha, subtítulos, conclusão). Mantenha os prompts em arquivos separados e fáceis de editar.
- Progresso em tempo real na UI (gerando título → conteúdo → imagem → publicando) e resultado com link "Ver no blog".
- Sem quota, sem limite: nada de contador de plano em lugar nenhum.

5. DASHBOARD REAL
- Card roxo em gradiente no topo com o resumo de produção do mês (publicados no mês, agendados nas próximas 24h, linhas ativas) — mesmo peso visual do card de plano do Wordbee, sem conteúdo de plano.
- Três cards de métrica com ícone colorido: Total publicados · Publicados este mês · Sites cadastrados.
- "Ações rápidas" (Gerar artigo agora em destaque roxo, Gerenciar sites WordPress, Configurar IAs / "IAs configuradas" quando houver chave, Ver histórico) e "Últimos artigos" com chips de tipo e site + link externo.

🛑 PARADA ÚNICA DESTE PROMPT: quando tudo estiver implementado, me peça (1) uma chave de IA para teste e (2) URL, usuário e senha de aplicação de um blog WordPress real, para validarmos uma publicação de verdade ponta a ponta. Até eu responder, deixe tudo testado com mocks e siga com o restante do checklist.

Ao terminar: typecheck, lint, build e testes verdes; PROGRESS.md e DECISIONS.md atualizados.
```

---

## PROMPT 3 — Linhas de Produção, worker, fila de títulos e histórico

```
Implemente o coração da automação. Este é o módulo mais complexo — trate com cuidado e teste bem.

1. LINHAS DE PRODUÇÃO — LISTAGEM
- Página "Linhas de Produção" com subtítulo "Crie artigos automaticamente no piloto automático.", botão "+ Nova Linha" e estado vazio "Nenhuma linha de produção / Crie sua primeira linha para gerar artigos automaticamente." + botão "Criar Primeira Linha".
- Card de cada linha: nome + badge verde "Ativa" (ou cinza "Pausada"), linha de metadados com ícones (site · tipo de artigo · intervalo · contador "2/5" ou "12/∞"), linha "Tema: ..." truncada, linha "Último: — Próximo: 11/05/26, 15:54", barra de progresso fina e ações "Pausar"/"Retomar" e ícone de lixeira.
- Sem limite de linhas.

2. MODAL "NOVA LINHA DE PRODUÇÃO"
Replicar exatamente os campos e a disposição em duas colunas dos screenshots:
- Nome da linha* (placeholder "Ex: Blog de Receitas, Artigos Tech...")
- Site WordPress* | Categoria (opc.) — categoria carregada dinamicamente com estado "Carregando..."
- IA para Texto* | IA para Imagem*
- Tipo de artigo* (dropdown scrollável com os 14 tipos)
- Tema / Nicho* (placeholder "Ex: Receitas fit, Marketing digital..." + ajuda "A IA vai criar artigos variados dentro deste tema")
- Intervalo* (10, 15, 20, 30, 45 min, 1h, 2h, 3h, 6h, 12h, 24h "1x por dia") | Máximo de artigos (placeholder "Ilimitado" + ajuda "Deixe vazio para ilimitado")
- Status no WordPress (Publicado/Rascunho + ajuda "Artigos serão publicados automaticamente")
- Prompt customizado (opcional)
- Imagens de Referência (opcional): upload de até 5 imagens com preview em miniaturas, estado "Enviando...", texto de ajuda "A IA usará como inspiração visual ao gerar as imagens dos artigos. Funciona melhor com Gemini como provedor de imagem."
- Botões "Cancelar" e "Criar Linha de Produção". Validação inline de todos os obrigatórios.

3. PÁGINA DE DETALHE DA LINHA
- Cabeçalho: seta de voltar, nome + badge de status, metadados em linha, "Temas: ..." e botão "Atualizar".
- Bloco "Imagens de Referência" com contador e galeria (máx. 5), editável.
- Bloco "Fila de Títulos" com contador "3 na fila", botão "Gerar Títulos", itens numerados com título e "Previsto: dd/mm/aa, hh:mm", clique abre edição inline do título, e a nota "Clique em um título para editá-lo antes da publicação. Novos títulos são gerados automaticamente após cada artigo publicado." Estado vazio com "Nenhum título na fila".
- Bloco "Artigos Publicados" com contador, ícone verde de sucesso, título, "Publicado em dd/mm/aa, hh:mm" e botão "Ver no blog ↗". Estado vazio "Nenhum artigo publicado ainda."

4. WORKER E AGENDADOR (BullMQ)
- Repeatable job por linha ativa, respeitando o intervalo; next_run_at persistido e exibido na UI.
- Lock por linha: nunca duas execuções simultâneas da mesma linha. Idempotência: um retry jamais publica o mesmo artigo duas vezes (chave de idempotência por job).
- Limite de concorrência global por provedor de IA, configurável por env (padrão 3), para não estourar rate limit com muitas linhas ativas.
- Fluxo de cada execução: pegar próximo título da fila (gerar um se estiver vazia, evitando duplicar títulos já publicados na linha) → gerar conteúdo → gerar imagem (passando as imagens de referência quando o provedor for Gemini) → upload de media → criar post → registrar em articles → recalcular next_run_at → gerar um novo título para repor a fila.
- Máximo de artigos: ao atingir, pausar a linha automaticamente com motivo registrado. Máximo vazio = roda indefinidamente.
- Rate limit do provedor: comportamento configurável entre adiar o próximo disparo (backoff) ou pausar a linha com aviso visível no painel. Implemente ambos, padrão = adiar.
- Falha após 3 tentativas com backoff: artigo entra como "Falha" com mensagem legível e a linha continua ativa; 5 falhas consecutivas pausam a linha e destacam alerta no dashboard.
- Testes automatizados do agendador com IA e WordPress mockados: cenário de máximo atingido, de rate limit, de falha e retry, de duplicidade e de lock.

5. HISTÓRICO
- Lista paginada com título, site, tipo, origem (nome da linha ou "Manual"), data, badge de status (Publicado, Rascunho, Falha, Processando) e link "Ver no blog".
- Filtros por site, status, linha e período + busca por título.
- Ação "Reenviar" nos artigos com falha, reaproveitando o conteúdo já gerado quando existir (não regerar à toa).

Ao terminar: typecheck, lint, build e testes verdes; PROGRESS.md e DECISIONS.md atualizados; me diga em uma frase como acompanhar os logs do worker.
```

---

## PROMPT 4 — Fidelidade visual, robustez e deploy

```
Última etapa: deixar o app pronto para eu usar de verdade, todos os dias.

1. AUDITORIA DE FIDELIDADE VISUAL
- Percorra tela por tela comparando com os screenshots do Wordbee e corrija espaçamentos, pesos de fonte, tamanhos de ícone, raios, sombras, cores de badge e microcópia em português. O objetivo é que, lado a lado, as telas sejam indistinguíveis (exceto pela ausência de planos/quota).
- Garanta responsividade real em mobile e tablet, incluindo os modais longos (linha de produção) e as tabelas.
- Acessibilidade: foco visível, labels associados, contraste AA, modais com trap de foco e fechamento por ESC.

2. ROBUSTEZ
- Estados de carregamento (skeletons) e de erro em todas as telas; toasts para toda ação de sucesso/erro.
- Revalidação de dados após mutações; nenhum estado obsoleto na tela após criar/editar/excluir.
- Tratamento e exibição amigável de todos os erros normalizados dos clientes de IA e do WordPress.
- Varredura de segurança: confirme que nenhuma rota de API responde sem sessão válida, que nenhuma resposta ou log contém chave/senha em texto puro, que uploads validam tipo e tamanho, e que não há SSRF na URL do site WordPress (bloqueie IPs privados/localhost).

3. OPERAÇÃO
- Página de Perfil finalizada: nome, troca de senha, 2FA, encerrar sessões.
- Logs estruturados no worker por job (linha, etapa, duração, provedor, resultado) e um indicador de saúde do worker visível no dashboard (última execução bem-sucedida).
- Script de backup/restore do banco.

4. DEPLOY E DOCUMENTAÇÃO
- Dockerfile do web e do worker + docker-compose de produção (app, worker, postgres, redis) para eu subir em um VPS único.
- README.md com: pré-requisitos, variáveis de ambiente explicadas uma a uma (incluindo como gerar ENCRYPTION_KEY), passo a passo de instalação local, passo a passo de deploy no VPS, como obter cada chave de IA, como gerar a senha de aplicação no WordPress e como acompanhar/pausar linhas.
- Checklist final marcando cada critério de aceite da seção 9 do PRD, com o resultado de cada um.

🛑 PARADA FINAL: me entregue o resumo do que foi feito, os pontos que exigem minha ação (variáveis a preencher, chaves a gerar) e qualquer decisão relevante que tomou sozinho.
```

---

## Observações

- **Se preferir ainda menos paradas:** entregue ao Claude Code, já no PROMPT 0, um `.env` preenchido com uma chave de IA de teste e as credenciais de um blog WordPress de rascunho. Isso elimina a 🛑 do Prompt 2 e ele valida a publicação real sozinho.
- **Contexto:** os Prompts 2 e 3 são densos. Se a sessão ficar longa demais, peça um `/compact` antes do Prompt 3 — o `PROGRESS.md` e o `DECISIONS.md` mantêm a continuidade.
- **Screenshots:** salve os prints do Wordbee em uma pasta `/referencia` do projeto e mencione isso no Prompt 0; o Claude Code consegue lê-los e a fidelidade visual sobe bastante.
