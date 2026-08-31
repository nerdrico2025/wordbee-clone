# Distribuição Automatizada de Conteúdo — Especificação (Wordbee)

> Documento vivo. Atualizado a cada aula do especialista enviada pelo Rafael. Ainda **não é o plano de ação final** — isso só é montado quando todas as aulas forem enviadas e o Rafael confirmar.

**Status atual:** aguardando mais aulas. 4 aulas processadas até agora.

---

## 1. Contexto e objetivo real

O especialista ensina uma estratégia de captação de audiência 100% orgânica (sem tráfego pago): gerar posts de "captação" a partir de conteúdo de receitas, distribuí-los em massa dentro de grupos do Facebook, e converter cliques em entradas num grupo de WhatsApp, que passa a ser a base de audiência do negócio.

O objetivo do Rafael é o mesmo — usar a distribuição em grupos pra levar tráfego dos artigos do Wordbee até uma audiência de WhatsApp — mas com um desenho que **dura**, ao invés de um que depende de enganar sistemas anti-spam.

## 2. Adaptações do Rafael em relação ao modelo original (não-negociáveis)

| Modelo do especialista | Modelo do Rafael |
|---|---|
| Dezenas/centenas de perfis fake criados em massa (1/dia) | Perfis **reais** de membros da família, consentindo em ajudar |
| Um "especialista" fake por nicho/blog | Um especialista **real**, parceiro, por trás de cada blog |
| Postagem em qualquer grupo, sem permissão (spam) | Só em grupos onde há **acordo comercial de parceria com o dono** |
| Parceria de grupo não necessariamente informada aos membros | **Confirmado pelo Rafael**: o dono do grupo comunica aos membros que é uma parceria/publicidade — resolve a preocupação de publicidade velada (CDC/CONAR) |
| Imagens "roubadas" de posts virais de terceiros (achadas no Google/Pinterest, remontadas no Canva) | Substituído por geração de imagem via IA (providers que o Wordbee já tem) — sem uso de conteúdo de terceiros |
| Objetivo: escalar pra centenas/milhares de perfis fake | Objetivo: gestão eficiente de um número **finito e real** de perfis (família) e grupos (parceiros pagos) |

## 3. Restrição técnica de fundo (vale para todo o desenho)

A Graph API do Facebook **não permite** publicação automatizada em Grupos (API de Grupos descontinuada em 2024) nem em perfis pessoais (nunca existiu publish automatizado pra perfil pessoal — só para Páginas). Isso não é uma limitação da estratégia do Rafael, é uma limitação da própria plataforma, e vale pra qualquer implementação.

Consequência de desenho, válida para tudo que vem depois: a funcionalidade terá **dois trilhos**:

- **Trilho automático** (via API oficial, roda sozinho): publicação nas Páginas do Facebook que os parceiros administram.
- **Trilho assistido** (grupos e perfis pessoais, sem API possível): o app monta o pacote de distribuição (imagem + copy + copy de comentário) e organiza uma fila de "o que postar, onde, com qual perfil, quando" — a pessoa executa manualmente, e o app registra que foi feito.

---

## 4. Conceitos extraídos das aulas, por aula

### Aula 1 — Criação do post de captação

- **Fluxo de criação (modelo original, com Canva + imagens de terceiros)**: buscar posts de receita virais no Facebook (usando perfil separado do da própria página, pra não ver só os próprios posts), montar uma imagem tipo "álbum" — grade de 2 fotos — no Canva (1080×1350), baixar, postar na Página.
  - → **Adaptação Wordbee**: a "imagem tipo álbum" não precisa de conteúdo de terceiro. O provider de imagem (Gemini/OpenRouter) já gera imagem de capa; pode-se gerar um layout de grade/colagem diretamente via prompt, ou compor 2 imagens geradas num template fixo.
- **Estrutura da copy do post (descrição)**: nome da receita + elogio/gancho + CTA (`"Diga QUERO. Estou passando os ingredientes..."`) + reticências (`Ver mais`) — o "Ver mais" é proposital: força o clique, que abre a área de comentários.
- **Estrutura da copy do comentário**: onde fica o link de verdade. Ex.: `"Linda rainha, diga QUERO e a receita vai abrir pra você no meu grupo. Entre. [link]"`. O link nunca vai na descrição do post — vai escondido no primeiro comentário, feito pela própria página.
- **Variações de copy** (do material de apoio em PDF que o Rafael enviou):
  - Copy de descrição: "ingredientes com ver mais", "curiosa com ver mais", "junção de ingredientes" (ex.: "Misturei X e Y e fiz essa receita, confira nos comentários"), "sem isso e sem aquilo".
  - Copy de comentário: "chamada para ação e link" (`Diga [palavra-chave] e pegue a receita aqui [link]`), "aviso com chamada para ação" (`Mandei a receita pra quem comentou [palavra-chave], aqui [link]`).
  - Nota do material: variar a palavra-chave pedida ajuda a engajar; o comentário pode linkar direto pro artigo/site em vez da landing page, mas sempre pedindo comentário antes.
- **Funil completo**: post na Página → comentário com link → link vai pra Landing Page → Landing Page redireciona pro grupo de WhatsApp.

### Aula 2 — Mecânica de distribuição manual em grupos

- **Por que não basta postar só na Página**: alcance orgânico de Página é baixo; grupos do Facebook têm alcance orgânico muito maior (o especialista cita grupos de 500 mil a 2,3 milhões de membros).
- **Mecânica manual, passo a passo**:
  1. Copiar o link do post já publicado na Página.
  2. Colar como novo post dentro do grupo (usando um perfil pessoal que é membro do grupo — não a Página).
  3. Aguardar o preview/thumbnail carregar.
  4. Apagar o texto do link colado, deixando só a prévia visual (link "escondido").
  5. Publicar no grupo.
  6. Curtir a própria publicação e comentar a palavra-chave combinada (ex.: `QUERO`) — reforça engajamento inicial artificialmente baixo → ajuda o algoritmo do grupo a distribuir mais.
- **Cadência recomendada**: mínimo de 10 posts de captação **por dia** (na Página) — cada um depois redistribuído pra múltiplos grupos.
- **Cada perfil (pessoa) pode estar em vários grupos** — o mesmo link é postado em cada grupo que o perfil integra.

### Aula 3 — Escala: perfis × grupos, aluguel de grupos parceiros

- **Fórmula de volume**: `publicações/dia = posts de captação/dia × nº de perfis × grupos por perfil`.
  - Exemplo do especialista: 10 posts/dia × 100 perfis × 2 grupos/perfil = 2.000 compartilhamentos/dia → 60.000/mês.
- **Modelo de "aluguel de grupos"**: existem intermediários que alugam pacotes de acesso a grupos grandes pra postagem paga. Exemplos de preço citados: ~R$200/mês para 20–30 grupos; ~R$2.000/mês para 200 grupos.
  - → **Já mapeado pra adaptação do Rafael**: isso é exatamente o "grupo parceiro com acordo comercial e divulgação de parceria" que ele descreveu. A diferença é que, no caso do Rafael, o parceiro **informa aos membros** que é publicidade — resolve a pendência de transparência que eu tinha levantado.
- **Escala de perfis**: o especialista recomenda criar 1 perfil novo por dia pra crescer o "exército" de contas.
  - → **Não se aplica ao Rafael**: perfis são pessoas reais da família, um conjunto finito. Isso vira, no app, um **recurso limitado a gerenciar** (quantos perfis existem, em quantos grupos cada um está, quanto cada um consegue postar por dia sem virar fadiga/spam pro próprio familiar) — não um motor de crescimento automatizável.
- **Comentário do especialista no meio da aula**: os próprios perfis dele que aparecem no exemplo são "meio que admins dos grupos" e normalmente não compartilham nesses grupos — reforça que, mesmo no modelo dele, existe uma distinção entre "perfil que administra/tem relação com o grupo" e "perfil que posta". Vale considerar essa distinção na modelagem de dados (perfil pode ter papel de "admin do grupo" ou só "membro que posta").

### Aula 4 — Álbuns de captação (formato "álbum real") e captação antes do conteúdo

- **Formato "álbum real"**: em vez de uma imagem única em grade (Aula 1), o post é um **álbum nativo do Facebook** — várias fotos (recomendado: 5+1 "bônus" só pra aparecer o indicador "+1"/"+2" no card, que segundo o especialista aumenta engajamento/abertura) publicadas juntas como álbum, cada uma buscada em fontes de imagens virais (Pinterest/Google no modelo original).
  - → **Adaptação Wordbee, igual já decidido nas aulas anteriores**: não usar imagens de terceiros. O provider de imagem gera o conjunto de fotos (ex.: gerar N variações da mesma receita/tema), compondo um álbum nativo em vez de uma colagem única.
- **Duas variantes de álbum, com destinos diferentes** — conceito novo e importante, o especialista trata como dois "modos" nomeados:
  - **"Álbum de captação"**: legenda de cada foto = `"Deixei a receita no primeiro comentário"`; o comentário leva a pessoa pra **landing page → grupo de WhatsApp** (mesmo funil das aulas 1–3). Usado quando ainda não existe conteúdo pronto no blog sobre aquele tema (ver ponto abaixo).
  - **"Álbum direto pro site"**: comentário leva a pessoa direto pra **página de busca do blog** (ex.: `seusite.com/?s=doce+de+leite`), não pro artigo específico. Motivo dado: a página de busca expõe mais anúncios (incluindo anúncio "vinheta" em tela cheia, citado como o formato que mais paga) antes da pessoa chegar ao conteúdo, e mantém a pessoa rolando a página. Só compensa usar esse modo quando o blog já tem **múltiplos artigos** sobre aquele tema — o especialista explicitamente evita mandar tráfego pra um tema com um artigo só.
- **Inversão da ordem produção → captação** (o insight mais relevante da aula pra arquitetura do Wordbee): o especialista **não escreve o artigo primeiro**. Ele testa a demanda publicando um álbum de captação sobre um tema que ainda não tem conteúdo no blog; só escreve o artigo depois, quando pessoas comentam/chegam no privado pedindo aquele tema especificamente — validação de demanda antes de gastar geração de conteúdo.
  - → **Isso é uma peça de arquitetura relevante, não só uma copy**: hoje as Linhas de Produção do Wordbee geram artigo a partir de um tema pré-definido pelo dono. Esse conceito sugere um fluxo adicional (opcional) de **"captação exploratória"**: publicar teste de demanda pra um tema, medir interesse (comentários/cliques/entradas no grupo pedindo aquele tema), e só então disparar a geração do artigo — quase um "sinal de disparo" pro pipeline de geração, vindo de fora pra dentro, em vez de agendado por intervalo.
- **Gestão de link continua igual**: sempre copiar o link do post publicado pro bloco de notas (no caso do Wordbee, viraria registro na fila de distribuição), pra reuso posterior em grupos.
- **Distinção de nomenclatura usada operacionalmente pelo especialista com a equipe**: "álbum de captação" vs. "álbum direto pro site" são comandos padronizados — sugere que o Wordbee deveria ter um **tipo de pacote de distribuição** selecionável (captação vs. tráfego direto), não um formato único.

---

## 5. Mapeamento preliminar para features do Wordbee (rascunho — não final)

> Isto é um rascunho de trabalho pra ajudar a pensar, não a especificação final pro Claude Code. Será consolidado só ao final, com todas as aulas.

### Entidades novas (candidatas)
- **`perfis_divulgacao`**: perfil real de pessoa (familiar/parceiro) usado pra divulgação — nome, a quem pertence, nicho(s) associado(s), papel (admin de grupo / postador).
- **`grupos_parceiros`**: grupo do Facebook com acordo comercial — nome, link, nº de membros (informativo), dono/contato, valor pago, período do acordo, confirmação de que o grupo divulga a parceria aos membros, status (ativo/pausado).
- **`perfil_grupo`** (relação N:N): qual perfil está em qual grupo.
- **`pacotes_distribuicao`**: gerado a partir de um artigo publicado (ou de um tema exploratório ainda sem artigo — ver Aula 4) — imagem(ns) de captação (grade/colagem ou álbum de várias fotos, geradas por IA), copy de descrição (com variações), copy de comentário (com link rastreado). Precisa de um campo de **tipo/destino**: `captacao` (comentário leva à landing/WhatsApp) vs. `direto_site` (comentário leva à página de busca do blog, só quando o tema já tem múltiplos artigos publicados).
- **`fila_distribuicao`**: agenda de "o que postar, em qual grupo, com qual perfil, quando" — trilho assistido.
- **`registro_publicacao`**: marca que uma entrada da fila foi executada (manual), com timestamp — permite medir cadência real vs. planejada.
- **Links rastreados (UTM)**: cada combinação (artigo × perfil × grupo) gera um link único pra landing page, permitindo medir de qual grupo/perfil veio cada entrada no grupo de WhatsApp.

### Automação real possível (trilho automático)
- Geração do pacote de distribuição (imagem + copy + copy de comentário) disparada automaticamente a cada artigo publicado por uma Linha de Produção — reaproveitando os providers de IA já integrados.
- Publicação automática nas Páginas do Facebook via Graph API oficial (token de Página), incluindo o comentário com o link, no mesmo padrão de agendamento (scheduler cron+Postgres, jitter, concorrência) já existente no worker.
- Geração automática dos links rastreados (UTM) por combinação perfil×grupo.

### Trabalho assistido, organizado pelo app (trilho manual)
- Painel/fila diária: "hoje, perfil X posta em grupos Y e Z, aqui está a imagem, a copy e o link — clique pra copiar".
- Checklist de execução por perfil/grupo/dia, com registro de conclusão.
- Painel de gestão de grupos parceiros (contrato, valor, vigência, se está divulgando a parceria).
- Dashboard de projeção de volume (a fórmula da Aula 3: posts/dia × perfis × grupos/perfil) — pra planejamento, não como promessa.

### Ainda em aberto (dependente de mais aulas ou de decisão do Rafael)
- Como medir "conversão real" pro grupo de WhatsApp (a landing page conta cliques? cria contagem por link único?).
- Integração com WhatsApp Business/Cloud API pra broadcast — ainda não coberta em nenhuma aula até aqui.
- Se cada blog/nicho terá seu próprio conjunto de perfis e grupos, ou se há sobreposição.
- Regras de "fadiga" por perfil (limite diário de posts por pessoa, pra não sobrecarregar o familiar).
- **Novo (Aula 4)**: vale implementar o fluxo de "captação exploratória → geração de artigo sob demanda"? Isso significaria a distribuição não é só *consumidora* do que as Linhas de Produção já geraram, mas também pode virar **gatilho** pra gerar um artigo novo quando um tema mostrar demanda real. Precisa de validação com o Rafael se isso entra no escopo agora ou fica pra uma fase futura (é uma inversão de fluxo bem maior que o resto da feature).
- **Novo (Aula 4)**: como decidir automaticamente entre pacote `captacao` e `direto_site`? A regra descrita foi "só manda pra página de busca se já houver vários artigos sobre o tema" — dá pra automatizar com uma contagem de artigos publicados por tema/categoria no próprio banco do Wordbee.

---

## 7. Nota importante — limite mantido (Aulas 5–6)

As Aulas 5–6 mostram o especialista usando um **navegador antidetecção** (ixBrowser), gerenciando centenas de perfis (565, no exemplo) organizados em lotes mensais, com substituição contínua de perfis banidos ("Caiu" → "Apelação" → repõe), e uma ferramenta terceira ("Plubie") cujo propósito é **automatizar a postagem em massa** através desses perfis nos grupos.

Esse desenho — independentemente de quantos perfis individuais sejam de pessoas reais — é estruturalmente uma operação de contas coordenadas em escala, com ferramental construído especificamente pra evadir detecção de comportamento inautêntico. **Isso não será incorporado à especificação do Wordbee.** Nenhuma automação de postagem multi-conta, nem integração com navegador antidetecção, entra no plano de ação, independente da escala.

O trilho assistido já desenhado (seção 5) continua válido e é suficiente para o modelo combinado com o Rafael (perfis reais de família, execução manual, cadência humana) — sem depender de nenhuma das ferramentas citadas nessas aulas.

**Esclarecimento do Rafael**: as Aulas 5–6 mostram a operação do próprio especialista (escala industrial), não o que o Rafael pretende rodar — ele confirmou que não vai criar perfis em massa e que a divulgação será só em grupos autorizados/parceiros. A ressalva acima sobre não incorporar ixBrowser/automação multi-conta permanece válida como princípio, independente da escala.

**Decisão final sobre o Plubie (Aula 7)**: confirmado pela transcrição e pelos prints — o Plubie controla o X-Browser (via API do próprio X-Browser) para abrir o Facebook e preencher/publicar o post *dentro da sessão logada da conta pessoal*, tanto no feed quanto em grupos, incluindo o primeiro comentário automático. Não há nenhum ponto do fluxo que use a API oficial da Meta. É automação de sessão de navegador de conta pessoal, o mesmo mecanismo já descartado.

**Isso fecha a questão "construir vs. contratar" levantada pelo Rafael**: nenhuma das duas opções entra no Wordbee. Contratar o Plubie não muda o mecanismo nem o risco — só troca quem escreveu a automação. O Wordbee não vai integrar com o Plubie, nem com o X-Browser/qualquer navegador antidetecção, nem construir equivalente próprio. Essa decisão é definitiva, não uma pendência para reavaliar.

**Desenho final da funcionalidade** (ver plano de ação completo no arquivo `plano-acao-claude-code-distribuicao.md`):
- **Trilho automático**: publicação nas Páginas do Facebook via Graph API oficial (token de Página) — automação real, sem risco de automação de conta pessoal.
- **Trilho assistido**: para grupos e perfis pessoais, o Wordbee organiza (fila diária, pacotes prontos, links rastreados, registro de execução) mas a postagem em si é sempre um clique humano real — sem automação de sessão/conta.

---

## 8. Log de aulas processadas

| # | Tema | Processada em |
|---|---|---|
| 1 | Criação do post de captação (imagem, copy, funil pra WhatsApp) | ✅ |
| 2 | Mecânica de distribuição manual em grupos (copiar link, comentar palavra-chave) | ✅ |
| 3 | Escala via múltiplos perfis × grupos, modelo de aluguel de grupos parceiros | ✅ |
| 4 | Álbuns de captação (formato real), "álbum de captação" vs. "álbum direto pro site", inversão captação→conteúdo | ✅ |
| 5–6 | Compartilhamento manual em grupos (ok, já coberto) + navegador antidetecção (ixBrowser) gerenciando centenas de perfis + ferramenta de automação de postagem em massa (Plubie) | ⚠ recebido, **não incorporado** — ver seção 7 |
| 7 | Configuração e funcionamento do Plubie (confirma automação de sessão/navegador de conta pessoal) | ⚠ recebido, **decisão final: não incorporado** — ver seção 7 |

**Status**: todas as aulas foram enviadas (confirmado pelo Rafael). Documento de especificação encerrado. Plano de ação para o Claude Code em arquivo separado: `plano-acao-claude-code-distribuicao.md`.
