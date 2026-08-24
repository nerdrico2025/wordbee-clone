# Dockerfile do app web (Next.js). Build a partir da RAIZ do monorepo:
#   docker build -f apps/web/Dockerfile -t wordbee-web .
FROM node:20-slim AS base
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

# --- deps: instala tudo uma vez, aproveitando cache de camada ---
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN npm ci --ignore-scripts && npm rebuild @node-rs/argon2 @prisma/client prisma 2>/dev/null || true

# --- builder: compila packages/shared, packages/db e o app web ---
FROM base AS builder
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run db:generate \
  && npm run build -w packages/shared \
  && npm run build -w packages/db \
  && npm run build -w apps/web

# --- runtime: só o output standalone do Next + assets estáticos ---
FROM node:20-slim AS runner
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "apps/web/server.js"]
