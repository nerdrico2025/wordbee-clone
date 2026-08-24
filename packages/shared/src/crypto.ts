import { randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/**
 * Lê e valida a chave-mestra de criptografia a partir de ENCRYPTION_KEY
 * (base64 de exatamente 32 bytes). Lança erro cedo se mal configurada —
 * preferível a falhar silenciosamente na hora de gravar um segredo.
 */
export function getMasterKey(rawKey: string | undefined = process.env.ENCRYPTION_KEY): Buffer {
  if (!rawKey) {
    throw new Error(
      "ENCRYPTION_KEY não configurada. Gere uma com: openssl rand -base64 32"
    );
  }
  const key = Buffer.from(rawKey, "base64");
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `ENCRYPTION_KEY inválida: esperado ${KEY_LENGTH_BYTES} bytes após decode base64, recebido ${key.length}.`
    );
  }
  return key;
}

/** Criptografa um texto plano com AES-256-GCM. IV aleatório por chamada. */
export function encrypt(plaintext: string, masterKey: Buffer = getMasterKey()): EncryptedPayload {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/**
 * Descriptografa um payload AES-256-GCM. Lança erro se o authTag não bater
 * (dado adulterado ou chave errada) — GCM garante autenticidade + integridade.
 */
export function decrypt(payload: EncryptedPayload, masterKey: Buffer = getMasterKey()): string {
  const iv = Buffer.from(payload.iv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");

  const decipher = createDecipheriv(ALGORITHM, masterKey, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

/**
 * Gera uma máscara segura para exibição (ex.: "sk-...4a2f"), preservando só
 * o prefixo (para reconhecer o provedor) e os últimos 4 caracteres.
 * Nunca deve ser possível reconstruir o segredo a partir da máscara.
 */
export function maskSecret(secret: string, prefixLength = 3): string {
  if (secret.length <= prefixLength + 4) {
    return "•".repeat(Math.max(secret.length, 8));
  }
  const prefix = secret.slice(0, prefixLength);
  const suffix = secret.slice(-4);
  return `${prefix}...${suffix}`;
}

/** Comparação em tempo constante para strings (ex.: hashes de token). */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
