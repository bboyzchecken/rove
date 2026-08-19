# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- base
FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1

# ---------------------------------------------------------------- deps
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install

# ---------------------------------------------------------------- dev
# Source is bind-mounted by docker-compose and node_modules lives in a named
# volume, so package.json can drift from what was baked above. Reconciling on
# every start keeps `docker compose up` a single reliable command.
#
# CI=true matters: without it pnpm asks "remove node_modules and reinstall? (Y/n)"
# on a mismatch and blocks forever on a container with no TTY.
FROM deps AS dev
ENV CI=true
EXPOSE 3000
CMD ["sh", "-c", "pnpm install && exec pnpm dev"]

# ---------------------------------------------------------------- builder
FROM deps AS builder
COPY . .
# NEXT_PUBLIC_* values are inlined at build time, so they must be present here.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_BRAND_NAME
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
RUN pnpm build

# ---------------------------------------------------------------- prod
FROM base AS prod
ENV NODE_ENV=production
RUN addgroup -g 1001 nodejs && adduser -D -u 1001 -G nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
