import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageDriver, StorageSaveInput } from "./types.js";

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
}

function resolveBasePath(): string {
  const raw = process.env.STORAGE_LOCAL_PATH || "./storage/uploads";
  return path.resolve(raw);
}

/**
 * Storage local em disco (dev). Chave = nome de arquivo dentro de
 * STORAGE_LOCAL_PATH. Use um caminho ABSOLUTO nessa env var — como
 * apps/web e apps/worker rodam com cwd distintos, um caminho relativo
 * resolveria para diretórios diferentes em cada processo.
 */
export function createLocalStorageDriver(): StorageDriver {
  const basePath = resolveBasePath();

  return {
    async save({ buffer, filename }: StorageSaveInput) {
      await mkdir(basePath, { recursive: true });
      const key = `${randomUUID()}-${sanitizeFilename(filename)}`;
      await writeFile(path.join(basePath, key), buffer);
      return { key };
    },

    async read(key: string) {
      return readFile(path.join(basePath, key));
    },

    async delete(key: string) {
      await rm(path.join(basePath, key), { force: true });
    },

    publicUrl(key: string) {
      return `/api/uploads/${key}`;
    },
  };
}
