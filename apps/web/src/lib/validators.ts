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
