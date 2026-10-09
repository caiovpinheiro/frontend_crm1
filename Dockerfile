# syntax=docker/dockerfile:1

FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Build args (Easypanel / CI) — NEXT_PUBLIC_* precisam existir no momento do `next build`.
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXTAUTH_URL
ARG NEXTAUTH_SECRET
ARG AUTH_SECRET

ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXTAUTH_URL=${NEXTAUTH_URL}
ENV NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
ENV AUTH_SECRET=${AUTH_SECRET}

COPY package.json package-lock.json* ./
# SheetJS versionado no repo (`xlsx` = file:vendor/xlsx-0.20.3.tgz): o
# `npm ci` precisa do tarball antes do `COPY . .`.
COPY vendor ./vendor
# Cache do npm entre builds (BuildKit cache mount) -- reduz ~30s por build.
RUN --mount=type=cache,target=/root/.npm \
    npm ci 2>/dev/null || npm install

COPY . .
RUN mkdir -p public
ENV NEXT_TELEMETRY_DISABLED=1
# Cache do .next/cache (webpack incremental) -- corta ~50-70% do tempo do
# `next build` em rebuilds. Precisa BuildKit habilitado (padrao no Actions).
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
