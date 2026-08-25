import "server-only";
import { prisma } from "@wordbee/db";
import type { AiProvider, ApiKeyKind } from "@wordbee/db";
import { decrypt, encrypt, maskSecret, validateProviderKey, TEXT_PROVIDERS, IMAGE_PROVIDERS } from "@wordbee/shared";
import type { AiProviderName } from "@wordbee/shared";

export type Capability = "TEXTO" | "IMAGEM";

/** OpenAI, Gemini e OpenRouter compartilham uma única chave para texto e imagem (RF-13). */
function tipoForSave(provider: AiProviderName, capability: Capability): ApiKeyKind {
  if (provider === "OPENAI" || provider === "GEMINI" || provider === "OPENROUTER") return "AMBOS";
  return capability;
}

function tiposToQuery(capability: Capability): ApiKeyKind[] {
  return capability === "TEXTO" ? ["TEXTO", "AMBOS"] : ["IMAGEM", "AMBOS"];
}

export interface ApiKeyCard {
  provider: AiProviderName;
  nome: string;
  modeloLabel: string;
  descricao: string;
  keyPrefixPlaceholder: string;
  gratuito?: boolean;
  gratuitoNota?: string;
  docsUrl: string;
  suportaImagensReferencia?: boolean;
  configured: boolean;
  maskedKey?: string;
  statusValidacao?: boolean;
  lastValidatedAt?: string;
  lastError?: string;
}

export async function listApiKeyCards(userId: string): Promise<{ texto: ApiKeyCard[]; imagem: ApiKeyCard[] }> {
  const rows = await prisma.apiKey.findMany({ where: { userId } });

  function toCard(info: (typeof TEXT_PROVIDERS)[number], capability: Capability): ApiKeyCard {
    const tipos = tiposToQuery(capability);
    const row = rows.find((r) => r.provider === info.provider && tipos.includes(r.tipo));
    return {
      ...info,
      configured: !!row,
      maskedKey: row?.maskedHint,
      statusValidacao: row?.statusValidacao,
      lastValidatedAt: row?.lastValidatedAt?.toISOString(),
      lastError: row?.lastError ?? undefined,
    };
  }

  return {
    texto: TEXT_PROVIDERS.map((info) => toCard(info, "TEXTO")),
    imagem: IMAGE_PROVIDERS.map((info) => toCard(info, "IMAGEM")),
  };
}

export async function saveApiKey(userId: string, provider: AiProviderName, capability: Capability, rawKey: string): Promise<void> {
  // Valida a chave com uma chamada real e barata ao provedor antes de persistir (RF-15).
  await validateProviderKey(provider, rawKey);

  const tipo = tipoForSave(provider, capability);
  const { ciphertext, iv, authTag } = encrypt(rawKey);
  const maskedHint = maskSecret(rawKey);

  await prisma.apiKey.upsert({
    where: { userId_provider_tipo: { userId, provider: provider as AiProvider, tipo } },
    create: {
      userId,
      provider: provider as AiProvider,
      tipo,
      chaveEncrypted: ciphertext,
      iv,
      authTag,
      maskedHint,
      statusValidacao: true,
      lastValidatedAt: new Date(),
      lastError: null,
    },
    update: {
      chaveEncrypted: ciphertext,
      iv,
      authTag,
      maskedHint,
      statusValidacao: true,
      lastValidatedAt: new Date(),
      lastError: null,
    },
  });
}

/**
 * Remove a chave configurada para um provedor/capacidade (hard delete — ver
 * DECISIONS.md sobre a escolha entre apagar de vez e soft-delete).
 * Idempotente: se não houver chave configurada, não lança erro (`deleteMany`
 * apaga zero linhas).
 *
 * Para um provedor de chave compartilhada (`tipoForSave` retorna "AMBOS"),
 * apaga a única linha que serve texto e imagem — como `listApiKeyCards` lê
 * essa mesma linha para os dois cards (via `tiposToQuery`), a remoção já
 * reflete nos dois sem nenhuma lógica extra.
 */
export async function deleteApiKey(userId: string, provider: AiProviderName, capability: Capability): Promise<void> {
  const tipo = tipoForSave(provider, capability);
  await prisma.apiKey.deleteMany({ where: { userId, provider: provider as AiProvider, tipo } });
}

/** Descriptografa a chave configurada para um provedor/capacidade. Retorna null se não houver chave configurada. */
export async function getDecryptedApiKey(userId: string, provider: AiProviderName, capability: Capability): Promise<string | null> {
  const row = await prisma.apiKey.findFirst({
    where: { userId, provider: provider as AiProvider, tipo: { in: tiposToQuery(capability) }, statusValidacao: true },
  });
  if (!row) return null;
  return decrypt({ ciphertext: row.chaveEncrypted, iv: row.iv, authTag: row.authTag });
}

export interface ConfiguredProvider {
  provider: AiProviderName;
  nome: string;
  modeloLabel: string;
  suportaImagensReferencia?: boolean;
}

export async function listConfiguredProviders(userId: string, capability: Capability): Promise<ConfiguredProvider[]> {
  const rows = await prisma.apiKey.findMany({
    where: { userId, tipo: { in: tiposToQuery(capability) }, statusValidacao: true },
  });
  const registry = capability === "TEXTO" ? TEXT_PROVIDERS : IMAGE_PROVIDERS;
  return registry
    .filter((info) => rows.some((r) => r.provider === info.provider))
    .map((info) => ({ provider: info.provider, nome: info.nome, modeloLabel: info.modeloLabel, suportaImagensReferencia: (info as { suportaImagensReferencia?: boolean }).suportaImagensReferencia }));
}
