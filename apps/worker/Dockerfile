# Dockerfile do worker (BullMQ). Build a partir da RAIZ do monorepo:
#   docker build -f apps/worker/Dockerfile -t wordbee-worker .
FROM node:20-slim AS base
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN npm ci --ignore-scripts && npm rebuild @node-rs/argon2 @prisma/client prisma 2>/dev/null || true

FROM base AS builder
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN npm run db:generate \
  && npm run build -w packages/shared \
  && npm run build -w packages/db \
  && npm run build -w apps/worker

FROM node:20-slim AS runner
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 worker

# node_modules completo (não-standalone) — o worker roda direto via `node`,
# sem o tracing/otimização do Next, então mantemos as dependências reais.
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/package.json ./package.json
COPY --from=builder /repo/packages/db/dist ./packages/db/dist
COPY --from=builder /repo/packages/db/package.json ./packages/db/package.json
COPY --from=builder /repo/packages/db/prisma ./packages/db/prisma
COPY --from=builder /repo/packages/shared/dist ./packages/shared/dist
COPY --from=builder /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /repo/apps/worker/dist ./apps/worker/dist
COPY --from=builder /repo/apps/worker/package.json ./apps/worker/package.json

USER worker
CMD ["node", "apps/worker/dist/index.js"]
