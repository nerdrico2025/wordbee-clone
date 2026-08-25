/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@wordbee/db", "@wordbee/shared"],
  // Sem "output: standalone": o deploy do web é feito via Railpack (Vercel
  // e Railway), que já usam seu próprio empacotamento — nenhum dos dois
  // builda a partir de "apps/web/Dockerfile" nem lê ".next/standalone".
  // "standalone" exige trocar o script "start" para
  // "node .next/standalone/server.js" ("next start" não funciona nesse
  // modo — ver DECISIONS.md), e não traz nenhum benefício aqui.
  experimental: {
    // @node-rs/argon2 embarca um binário nativo (.node); bullmq tem um
    // adaptador opcional para Valkey (@valkey/valkey-glide) que não
    // instalamos (usamos Redis puro via ioredis) — nenhum dos dois deve
    // ser processado pelo bundler do webpack, só carregado via require em runtime.
    serverComponentsExternalPackages: ["@node-rs/argon2", "bullmq"],
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
