# Plano de Ação — Distribuição de Conteúdo (Wordbee)

**Como usar:** coloque este arquivo e `distribuicao-wordbee-especificacao.md` na raiz do projeto Wordbee Clone (o Claude Code já tem acesso a `PRD-Wordbee-Clone.md`, `PROJECT-STATE.md` e `DECISIONS.md` — leia todos antes de começar). São **3 prompts sequenciais**. Uma única parada obrigatória (🛑), no ponto em que são necessárias credenciais reais (token de Página do Facebook).

## Contexto que o Claude Code precisa entender antes de começar

O Wordbee já publica artigos automaticamente em blogs WordPress via Linhas de Produção (scheduler cron+Postgres, worker no EasyPanel, providers de IA texto/imagem via abstração `TextProvider`/`ImageProvider`). Esta feature nova adiciona **distribuição** desses artigos — levar tráfego do blog até uma audiência de WhatsApp — através de dois canais complementares, com um limite de escopo não-negociável:

### Limite de escopo — leia antes de escrever qualquer código

**Não implementar, em nenhuma hipótese, mesmo que pareça tecnicamente elegante ou que o Rafael peça mudança de ideia depois:**
- Integração com navegador antidetecção (ixBrowser ou qualquer equivalente).
- Automação de sessão/navegador para controlar contas pessoais do Facebook (login automatizado, preenchimento de campos de post via scripting/RPA, etc.) — nem para páginas, nem para grupos, nem para perfis.
- Integração com Plubie ou qualquer ferramenta terceira que faça esse tipo de automação.
- Qualquer mecanismo que publique em **Grupos** do Facebook de forma automatizada — a API de Grupos foi descontinuada pela Meta; não existe caminho oficial, e todo caminho não-oficial usa o mecanismo do item acima.

**Por quê isso é uma linha dura, não uma preferência de implementação**: automação de conta pessoal via navegador/sessão viola os Termos de Uso da Meta independente de quem autorizou o quê (donos de grupo não podem autorizar isso em nome da Meta), e o risco de banimento recai sobre contas reais de pessoas reais (família do Rafael). Se o Claude Code se deparar com um requisito que pareça precisar disso, ele deve **parar e perguntar ao Rafael**, não implementar uma versão "mais discreta" do mesmo mecanismo.

**O que É automatizável, e é o que este plano implementa:**
- Publicação em **Páginas** do Facebook via **Graph API oficial** (token de Página — mecanismo diferente, sancionado, feito exatamente para isso).
- Toda a geração de conteúdo, organização, fila de trabalho e rastreamento — o trabalho humano de postar em grupos/perfis pessoais continua manual (um clique real, de uma pessoa real), mas o Wordbee faz esse clique ser rápido e organizado.

---

## PROMPT 1 — Modelo de dados, trilho automático (Páginas via Graph API)

```
Leia PRD-Wordbee-Clone.md, PROJECT-STATE.md, DECISIONS.md e distribuicao-wordbee-especificacao.md na raiz do projeto antes de começar — eles são a fonte de verdade de arquitetura e das decisões já tomadas no Wordbee.

OBJETIVO deste prompt: implementar o trilho automático de distribuição — publicação de artigos nas Páginas do Facebook via Graph API oficial — reaproveitando a arquitetura já existente (scheduler cron+Postgres, worker, abstração de providers de IA).

LIMITE DE ESCOPO OBRIGATÓRIO — leia a seção "Limite de escopo" do plano de ação antes de escrever qualquer linha de código. Não implemente automação de navegador/sessão de conta pessoal, não integre com Plubie ou ixBrowser, não publique em Grupos via nenhum mecanismo. Se em algum momento a única forma de atender um requisito for por esse caminho, pare e me pergunte — não implemente uma alternativa "mais discreta" do mesmo mecanismo.

🛑 PRÉ-REQUISITO DESTE PROMPT: a validação real de ponta a ponta do item 4 (publicação automática) exige um Page ID e um token de acesso de Página do Facebook que eu administro de verdade. Enquanto eu não fornecer isso, implemente e teste tudo com mocks (cliente Graph API mockado nos testes) e siga em frente sem travar — não me pergunte por isso no meio do prompt, só sinalize no resumo final que essa validação real ficou pendente.

1. MODELO DE DADOS (novas tabelas, seguindo o padrão de `packages/db/prisma/schema.prisma`)
- `facebook_pages`: id, userId, nome de exibição, page_id (Meta), access_token_encrypted, iv, authTag (AES-256-GCM, mesmo padrão de api_keys/wp_sites), status_validacao, last_validated_at, wpSiteId? (opcional: vincular a Página a um blog/nicho específico), createdAt, updatedAt.
- `distribution_packages`: id, articleId (FK para `articles`, nullable — ver Prompt 2 para pacotes exploratórios sem artigo), tipo (enum: CAPTACAO | DIRETO_SITE), imagens (array de URLs, via storage driver já existente), copyDescricao, copyComentario, createdAt.
- `page_distribution_posts`: id, packageId, facebookPageId, status (enum: PENDENTE|AGENDADO|PUBLICADO|FALHA), fbPostId?, erro_msg?, scheduledFor, publishedAt?, createdAt, updatedAt. Índice em (status, scheduledFor) igual ao padrão de production_lines.

2. INTEGRAÇÃO GRAPH API
- Módulo em packages/shared/src/facebook/ (mesmo padrão de packages/shared/src/wordpress/): cliente para a Graph API oficial — publicar post de link/imagem em Página (POST /{page-id}/feed ou /photos), publicar comentário no post criado (POST /{post-id}/comments), validar token (GET /{page-id}?fields=name).
- Tratamento de erros normalizado (token expirado, permissão insuficiente, rate limit) com mensagens em português, mesmo padrão dos providers de IA existentes.
- Testes com mocks, sem depender da API real — mesmo padrão dos clientes de IA existentes.

3. TELA "PÁGINAS DO FACEBOOK" (novo item de menu)
- CRUD de facebook_pages: nome, page_id, campo para colar o token de Página (mascarado após salvo, nunca retornado em texto puro — mesmo padrão de api_keys). Botão "Testar conexão". Vínculo opcional a um site WordPress/nicho.
- Estado vazio, cards, mesmo design system já usado nas outras telas do Wordbee (ver PROMPT 1 original do projeto para o design system).

4. GERAÇÃO AUTOMÁTICA DE PACOTE + PUBLICAÇÃO AGENDADA
- Ao publicar um artigo (seja via Linha de Produção ou Criar Artigo manual), gerar automaticamente um distribution_package do tipo CAPTACAO: reaproveitar a imagem já gerada pelo artigo (ou gerar variação via ImageProvider), gerar copy de descrição e de comentário via TextProvider com um prompt específico (tom de captação: gancho + CTA + "ver mais", sem reproduzir a estrutura exata de nenhum texto de terceiro — gerar variações originais).
- Se o artigo/nicho tiver facebook_pages vinculadas, criar page_distribution_posts para cada uma, agendados com jitter (reaproveitar o padrão de jitter já usado no scheduler de Linhas de Produção) para não publicar tudo no mesmo segundo.
- Job no worker (mesmo padrão do line-scheduler): a cada tick, busca page_distribution_posts com scheduledFor vencido e status PENDENTE/AGENDADO, publica via Graph API, registra resultado. Reaproveitar lock por linha (FOR UPDATE SKIP LOCKED) adaptado para esta tabela.

Ao terminar: rode typecheck, lint, build e testes; corrija o que falhar; atualize PROGRESS.md e DECISIONS.md (documentando a decisão de não integrar automação de conta pessoal, com referência a este plano de ação, para que fique registrado no histórico do projeto e não seja "redescoberto" como opção numa sessão futura); me mostre um resumo curto.
```

---

## PROMPT 2 — Trilho assistido: perfis, grupos parceiros, pacotes e fila de distribuição

```
Continue a partir do que foi implementado no Prompt 1. Releia a seção "Limite de escopo" do plano de ação — ela se aplica com o mesmo peso a este prompt: tudo aqui é organização e preparação de trabalho humano, nunca automação da ação de postar em grupo ou perfil pessoal.

OBJETIVO: implementar o trilho assistido — gestão de perfis de divulgação (pessoas reais da família/parceiros), grupos parceiros (com acordo comercial disclosed), pacotes de conteúdo prontos para postar manualmente, e uma fila diária organizada por perfil.

1. MODELO DE DADOS
- `divulgacao_perfis`: id, userId, nome, observações (a quem pertence, nicho associado), ativo (bool), createdAt.
- `grupos_parceiros`: id, userId, nome, link do grupo, nome/contato do administrador, valor_pago, periodo_inicio, periodo_fim?, confirma_divulgacao_parceria (bool — o dono do grupo avisa aos membros que é parceria), status (ATIVO|PAUSADO|ENCERRADO), createdAt.
- `perfil_grupo` (N:N): divulgacaoPerfilId, grupoParceiroId, dataEntrada, status (ENTROU|AGUARDANDO_APROVACAO|APROVADO|REMOVIDO).
- `fila_distribuicao_manual`: id, packageId (FK para distribution_packages — reaproveitar a mesma tabela do Prompt 1, incluindo pacotes tipo DIRETO_SITE), divulgacaoPerfilId, grupoParceiroId, dataPrevista, status (PENDENTE|POSTADO|PULADO), postadoEm?, createdAt.
- `distribution_links` (rastreamento): id, packageId, divulgacaoPerfilId?, grupoParceiroId?, code (curto, único), destino_url (a landing page real), clique_count, createdAt.

2. GERAÇÃO DE PACOTE — TIPO CAPTACAO vs. DIRETO_SITE (conceito da Aula 4)
- Ao gerar um distribution_package, decidir/permitir escolher o tipo: CAPTACAO (comentário leva à landing page/WhatsApp) ou DIRETO_SITE (comentário leva à página de busca do blog por aquele tema — só fica disponível/sugerido quando já existem múltiplos artigos publicados naquele tema/categoria, calculável via contagem no próprio banco).
- Suporte a pacote do tipo "álbum" (múltiplas imagens, não só uma) — reaproveitar o ImageProvider para gerar um conjunto de imagens variadas do mesmo tema, não uma imagem de terceiro.
- Copy de comentário e descrição com variações (gerar 2-3 opções via IA, deixar o Rafael escolher ou usar a primeira).

3. LINKS RASTREADOS
- Endpoint público em apps/web (ex.: GET /r/:code) que registra o clique (incrementa distribution_links.clique_count) e faz redirect 302 para destino_url. Isso permite medir, por perfil e por grupo, quantos cliques cada divulgação gerou — sem depender de UTM em domínio externo.
- Ao montar um item da fila de distribuição manual, gerar automaticamente o distribution_link daquela combinação (pacote × perfil × grupo) e usar essa URL curta na copy do comentário.

4. TELAS
- "Perfis de Divulgação": CRUD simples de divulgacao_perfis.
- "Grupos Parceiros": CRUD de grupos_parceiros + gestão de perfil_grupo (quais perfis estão em qual grupo, status de aprovação) — inspirado na planilha mostrada nas aulas (Aula 6), mas como tela do próprio Wordbee, sem qualquer automação de postagem associada a esse cadastro.
- "Fila de Distribuição" (tela principal deste trilho): lista do dia agrupada por perfil, cada item mostrando o grupo, a imagem/copy do pacote pronta para copiar (botão de copiar rápido para descrição e para comentário separadamente), e um botão "Marcar como postado" que registra fila_distribuicao_manual.status = POSTADO e postadoEm = now(). Filtros por perfil, por grupo, por status, por data.
- Ao criar um pacote novo (Prompt 1), permitir distribuí-lo manualmente: selecionar quais combinações perfil×grupo devem entrar na fila, com data prevista (respeitando uma regra simples de "não repetir o mesmo perfil no mesmo grupo no mesmo dia", para não parecer spam).

5. FLUXO DE "CAPTAÇÃO EXPLORATÓRIA" (conceito da Aula 4) — OPCIONAL, NÃO IMPLEMENTAR NESTE CICLO A MENOS QUE O RAFAEL CONFIRME
- Este item fica de fora do escopo deste prompt por padrão. É uma inversão de fluxo em relação a como as Linhas de Produção funcionam hoje (tema pré-definido → geração agendada) e adiciona complexidade real — vale nascer como uma iteração separada, depois que o resto da feature estiver validado em uso real, não empacotado junto com a primeira entrega.
- Se o Rafael explicitamente pedir para incluir agora: permitir criar um distribution_package do tipo CAPTACAO vinculado a um tema (texto livre) em vez de um articleId — sem que exista artigo ainda. Quando esse pacote entra na fila e é distribuído, oferecer depois uma ação "Gerar artigo a partir deste tema" que leva pré-preenchido para o fluxo de Criar Artigo ou para criação de uma Linha de Produção.

Ao terminar: typecheck, lint, build e testes verdes; PROGRESS.md e DECISIONS.md atualizados.
```

---

## PROMPT 3 — Polimento, dashboard de distribuição e documentação

```
Última etapa desta feature. Releia novamente a seção "Limite de escopo" — ela vale para qualquer decisão de polimento também (ex.: não "otimizar" a fila manual adicionando um atalho de teclado que dispare postagem automática via script no navegador do usuário; isso seria reintroduzir o mecanismo vetado por uma porta lateral).

1. DASHBOARD DE DISTRIBUIÇÃO
- Novo bloco (ou nova aba) mostrando: publicações automáticas nas Páginas (últimos 7 dias, sucesso/falha por Página), fila manual do dia (quantos itens pendentes, quantos concluídos), cliques totais via distribution_links agrupados por perfil e por grupo (para o Rafael identificar quais parcerias de grupo realmente convertem).
- Projeção simples (a "fórmula" da Aula 3, mas como informação, não como promessa): pacotes/dia × perfis ativos × grupos/perfil médio = distribuições possíveis/dia, comparado ao realizado.

2. ROBUSTEZ
- Estados de carregamento, erro e vazio em todas as telas novas, mesmo padrão do resto do Wordbee.
- Revalidação após mutações (criar/editar/excluir perfil, grupo, pacote, marcar item da fila como postado).
- Confirmar que tokens de Página seguem o mesmo padrão de segurança de api_keys (nunca em texto puro em log/resposta).

3. DOCUMENTAÇÃO
- Atualizar README.md com uma seção "Distribuição": como cadastrar uma Página do Facebook e obter o token, como cadastrar um grupo parceiro, como funciona a fila manual no dia a dia.
- Registrar em DECISIONS.md, de forma explícita e fácil de encontrar depois, a decisão de escopo: por que a automação de grupos/perfis pessoais via navegador (Plubie/ixBrowser/equivalentes) foi deliberadamente excluída, para que uma sessão futura do Claude Code (ou o próprio Rafael, meses depois) não reabra essa porta sem revisitar o motivo.

Ao terminar: resumo do que foi feito, checklist do que precisa de ação do Rafael (validação real do token de Página fornecido — ou lembrete de que ainda está pendente — e configuração de Páginas), e qualquer decisão de escopo tomada sozinho.
```
