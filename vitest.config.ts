import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // O alias "@/" é o mesmo que `apps/web/tsconfig.json` define para o código
  // do app. Sem ele aqui, qualquer teste que carregue um módulo de
  // `apps/web/src` que importe outro por "@/..." falha ao resolver — foi o
  // que aconteceu ao testar `lib/distribution.ts`. Só `apps/web` usa esse
  // prefixo, então apontar direto para lá é seguro.
  resolve: {
    alias: { "@": path.resolve(__dirname, "apps/web/src") },
  },
  test: {
    environment: "node",
    include: [
      "packages/**/src/**/*.test.ts",
      "apps/**/src/**/*.test.ts",
      "apps/**/*.test.ts",
      "scripts/**/*.test.mjs",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
  },
});
