/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@wordbee/db", "@wordbee/shared"],
  output: "standalone",
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
