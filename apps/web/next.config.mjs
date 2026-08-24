/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@wordbee/db", "@wordbee/shared"],
  output: "standalone",
  experimental: {
    // @node-rs/argon2 embarca um binário nativo (.node); não deve ser
    // processado pelo bundler do webpack, só carregado via require em runtime.
    serverComponentsExternalPackages: ["@node-rs/argon2"],
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
