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
    // @node-rs/argon2 embarca um binário nativo (.node) — não deve ser
    // processado pelo bundler do webpack, só carregado via require em
    // runtime. (bullmq foi removido daqui junto com o scheduler BullMQ —
    // ver DECISIONS.md "scheduler cron+Postgres", 2026-08-30.)
    serverComponentsExternalPackages: ["@node-rs/argon2"],
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
