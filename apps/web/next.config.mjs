/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@wordbee/db", "@wordbee/shared"],
  // "standalone" é só para o deploy via Docker/VPS (apps/web/Dockerfile
  // espera .next/standalone). Na Vercel (que define a env var VERCEL
  // automaticamente) usamos o empacotamento serverless nativo dela.
  output: process.env.VERCEL ? undefined : "standalone",
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
