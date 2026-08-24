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
