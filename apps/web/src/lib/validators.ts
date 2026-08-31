import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe a senha."),
  totpCode: z.string().optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual."),
    newPassword: z.string().min(8, "A nova senha precisa ter pelo menos 8 caracteres."),
  })
  .strict();

export const updateProfileSchema = z
  .object({
    nome: z.string().min(1, "Informe um nome.").max(120).optional(),
    temaUi: z.enum(["light", "dark"]).optional(),
  })
  .strict();

export const totpVerifySchema = z.object({
  code: z.string().length(6, "O código precisa ter 6 dígitos."),
});

export const saveApiKeySchema = z.object({
  provider: z.enum(["OPENAI", "GEMINI", "GROK", "STABILITY", "OPENROUTER"]),
  capability: z.enum(["TEXTO", "IMAGEM"]),
  apiKey: z.string().min(1, "Informe a chave de API."),
});

/** Parâmetros de rota de DELETE /api/api-keys/[provider]/[capability]. */
export const apiKeyRouteParamsSchema = z.object({
  provider: z.enum(["OPENAI", "GEMINI", "GROK", "STABILITY", "OPENROUTER"]),
  capability: z.enum(["TEXTO", "IMAGEM"]),
});

const httpsUrl = z
  .string()
  .min(1, "Informe a URL do site.")
  .refine((v) => /^https?:\/\/.+/.test(v), "A URL precisa começar com http:// ou https://");

export const createWpSiteSchema = z.object({
  nome: z.string().min(1, "Informe um nome de exibição."),
  url: httpsUrl,
  usuario: z.string().min(1, "Informe o usuário do WordPress."),
  appPassword: z.string().min(1, "Informe a senha de aplicação."),
});

export const updateWpSiteSchema = z.object({
  nome: z.string().min(1).optional(),
  url: httpsUrl.optional(),
  usuario: z.string().min(1).optional(),
  appPassword: z.string().min(1).optional(),
});

export const articleTypeEnum = z.enum([
  "RECEITA",
  "TUTORIAL",
  "PASSO_A_PASSO",
  "NOTICIAS",
  "NOVIDADES",
  "CURIOSIDADES",
  "OPINIAO",
  "REVIEWS",
  "GUIA_COMPLETO",
  "COMPARATIVO",
  "LISTICLE",
  "FAQ",
  "ANALISE",
  "ESTUDO_DE_CASO",
]);

export const aiProviderEnum = z.enum(["OPENAI", "GEMINI", "GROK", "STABILITY", "OPENROUTER"]);

export const generateTitlesSchema = z.object({
  tipo: articleTypeEnum,
  tema: z.string().min(1, "Informe o tema."),
  iaTexto: aiProviderEnum,
  titulosExistentes: z.array(z.string()).optional(),
});

export const generateArticleSchema = z.object({
  wpSiteId: z.string().min(1, "Selecione um site."),
  categoriaWpId: z.number().int().optional(),
  iaTexto: aiProviderEnum,
  iaImagem: aiProviderEnum,
  tipo: articleTypeEnum,
  tema: z.string().min(1, "Informe o tema."),
  titulo: z.string().min(1, "Informe ou gere um título.").optional(),
  promptCustomizado: z.string().optional(),
  statusWp: z.enum(["PUBLISH", "DRAFT"]),
});

const INTERVALOS_MIN = [10, 15, 20, 30, 45, 60, 120, 180, 360, 720, 1440] as const;

export const createProductionLineSchema = z.object({
  nome: z.string().min(1, "Informe o nome da linha."),
  wpSiteId: z.string().min(1, "Selecione um site."),
  categoriaWpId: z.number().int().optional(),
  categoriaWpNome: z.string().optional(),
  iaTexto: aiProviderEnum,
  iaImagem: aiProviderEnum,
  tipoArtigo: articleTypeEnum,
  temas: z
    .array(z.string().min(1))
    .min(1, "Informe ao menos um tema."),
  intervaloMin: z.number().int().refine((v) => (INTERVALOS_MIN as readonly number[]).includes(v), "Intervalo inválido."),
  maxArtigos: z.number().int().positive().optional(),
  statusWp: z.enum(["PUBLISH", "DRAFT"]),
  promptCustomizado: z.string().optional(),
  rateLimitBehavior: z.enum(["ADIAR", "PAUSAR"]).optional(),
});

export const generateLineTitlesSchema = z.object({
  quantidade: z.number().int().min(1).max(10).optional(),
});

export const updateTitleQueueItemSchema = z.object({
  titulo: z.string().min(1, "Informe o título."),
});

export const resendArticleSchema = z.object({
  articleId: z.string().min(1),
});

// --- Distribuição: Páginas do Facebook (trilho automático) ----------------
// Só Páginas, via Graph API oficial. Não existe schema para "grupo" ou
// "perfil pessoal" aqui, e não deve ser adicionado — ver a seção "Limite de
// escopo" de plano-acao-claude-code-distribuicao.md e DECISIONS.md.

/** ID numérico da Página na Meta (aparece em Configurações da Página → Sobre). */
const facebookPageId = z
  .string()
  .min(1, "Informe o ID da Página.")
  .refine((v) => /^\d{3,}$/.test(v.trim()), "O ID da Página é só números (encontre em Configurações da Página → Sobre).");

const facebookPageToken = z
  .string()
  .min(20, "O token de Página parece curto demais. Cole o token completo.")
  .refine((v) => !/\s/.test(v.trim()), "O token não pode conter espaços.");

export const createFacebookPageSchema = z.object({
  nome: z.string().min(1, "Informe um nome de exibição.").max(120),
  pageId: facebookPageId,
  accessToken: facebookPageToken,
  /** Vínculo opcional a um blog. String vazia e null são tratados como "sem vínculo". */
  wpSiteId: z.string().nullish(),
});

export const updateFacebookPageSchema = z.object({
  nome: z.string().min(1).max(120).optional(),
  pageId: facebookPageId.optional(),
  accessToken: facebookPageToken.optional(),
  wpSiteId: z.string().nullish(),
});

// --- Distribuição: trilho assistido (perfis, grupos, pacotes, fila) -------
// Organização de trabalho humano. Nenhum schema aqui aceita credencial de
// conta pessoal, cookie ou sessão de navegador — e nenhum deve passar a
// aceitar. Ver a seção "Limite de escopo" do plano de ação.

export const createDivulgacaoPerfilSchema = z.object({
  nome: z.string().min(1, "Informe o nome da pessoa.").max(120),
  observacoes: z.string().max(2000).optional(),
  ativo: z.boolean().optional(),
});

export const updateDivulgacaoPerfilSchema = createDivulgacaoPerfilSchema.partial();

const dataIso = z
  .string()
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), "Data inválida (use o formato AAAA-MM-DD).");

export const createGrupoParceiroSchema = z.object({
  nome: z.string().min(1, "Informe o nome do grupo.").max(160),
  link: z
    .string()
    .min(1, "Informe o link do grupo.")
    .refine((v) => /^https?:\/\/.+/.test(v), "O link precisa começar com http:// ou https://"),
  adminContato: z.string().max(200).optional(),
  valorPagoCentavos: z.number().int().min(0, "O valor não pode ser negativo.").optional(),
  periodoInicio: dataIso,
  periodoFim: dataIso.nullish(),
  confirmaDivulgacaoParceria: z.boolean().optional(),
  membrosAprox: z.number().int().positive().nullish(),
  status: z.enum(["ATIVO", "PAUSADO", "ENCERRADO"]).optional(),
});

export const updateGrupoParceiroSchema = createGrupoParceiroSchema.partial();

export const upsertPerfilGrupoSchema = z.object({
  divulgacaoPerfilId: z.string().min(1, "Selecione um perfil."),
  status: z.enum(["AGUARDANDO_APROVACAO", "APROVADO", "ENTROU", "REMOVIDO"]).optional(),
  dataEntrada: dataIso.nullish(),
});

export const createDistributionPackageSchema = z.object({
  articleId: z.string().min(1, "Selecione um artigo."),
  tipo: z.enum(["CAPTACAO", "DIRETO_SITE"]),
  /** 1 reaproveita a imagem do artigo; 2+ monta um álbum gerado por IA. */
  imagensAlvo: z.number().int().min(1).max(6).optional(),
});

export const updateDistributionPackageSchema = z.object({
  variacaoIndice: z.number().int().min(0).max(9),
});

export const enfileirarDistribuicaoSchema = z.object({
  dataPrevista: dataIso,
  combinacoes: z
    .array(
      z.object({
        divulgacaoPerfilId: z.string().min(1),
        grupoParceiroId: z.string().min(1),
      })
    )
    .min(1, "Selecione ao menos uma combinação de perfil e grupo."),
});

export const updateFilaItemSchema = z.object({
  status: z.enum(["PENDENTE", "POSTADO", "PULADO"]),
  observacao: z.string().max(500).nullish(),
});
