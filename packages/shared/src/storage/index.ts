import { createLocalStorageDriver } from "./local.js";
import type { StorageDriver } from "./types.js";

export * from "./types.js";

let cached: StorageDriver | undefined;

/**
 * Fábrica do driver de storage configurado via STORAGE_DRIVER.
 * "local" (padrão, disco) é o único implementado por enquanto — a
 * abstração já existe para trocar por S3/Supabase em produção sem tocar
 * no código que faz upload/leitura (RF de storage do PRD).
 */
export function getStorageDriver(): StorageDriver {
  if (cached) return cached;
  const driver = process.env.STORAGE_DRIVER || "local";
  if (driver !== "local") {
    throw new Error(`Driver de storage "${driver}" ainda não implementado. Use STORAGE_DRIVER=local.`);
  }
  cached = createLocalStorageDriver();
  return cached;
}
