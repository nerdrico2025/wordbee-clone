export interface StorageSaveInput {
  buffer: Buffer;
  filename: string;
}

export interface StorageDriver {
  /** Salva o arquivo e retorna uma chave opaca usada para ler/apagar/gerar URL depois. */
  save(input: StorageSaveInput): Promise<{ key: string }>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** Caminho público (relativo) pelo qual o app expõe o arquivo. */
  publicUrl(key: string): string;
}
