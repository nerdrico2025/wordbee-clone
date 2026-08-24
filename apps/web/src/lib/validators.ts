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
  provider: z.enum(["OPENAI", "GEMINI", "GROK", "STABILITY"]),
  capability: z.enum(["TEXTO", "IMAGEM"]),
  apiKey: z.string().min(1, "Informe a chave de API."),
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

export const generateTitlesSchema = z.object({
  tipo: z.enum([
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
  ]),
  tema: z.string().min(1, "Informe o tema."),
  iaTexto: z.enum(["OPENAI", "GEMINI", "GROK", "STABILITY"]),
  titulosExistentes: z.array(z.string()).optional(),
});

export const generateArticleSchema = z.object({
  wpSiteId: z.string().min(1, "Selecione um site."),
  categoriaWpId: z.number().int().optional(),
  iaTexto: z.enum(["OPENAI", "GEMINI", "GROK", "STABILITY"]),
  iaImagem: z.enum(["OPENAI", "GEMINI", "GROK", "STABILITY"]),
  tipo: generateTitlesSchema.shape.tipo,
  tema: z.string().min(1, "Informe o tema."),
  titulo: z.string().min(1, "Informe ou gere um título.").optional(),
  promptCustomizado: z.string().optional(),
  statusWp: z.enum(["PUBLISH", "DRAFT"]),
});
