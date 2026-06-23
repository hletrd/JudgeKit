# =============================================================================
# JudgeKit Next.js App — Multi-stage Docker Build
# Uses standalone output mode for minimal production image
# =============================================================================

FROM node:24-alpine AS base

# ---------------------------------------------------------------------------
# Stage 1: Install dependencies
# ---------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app

# Install build tools for native modules (argon2)
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# Stage 2: Build the Next.js application
# ---------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

# Build tools needed for native module rebuild during build
RUN apk add --no-cache python3 make g++

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# Dummy values for build-time — overridden at runtime via env
ENV AUTH_SECRET=build-placeholder-value-at-least-32-characters-long-for-nextauth
ENV AUTH_URL=http://localhost:3000
ENV AUTH_TRUST_HOST=true

# Set DISABLE_MINIFY=1 at build time to skip minification (useful for staging/debugging)
ARG DISABLE_MINIFY=0
ENV DISABLE_MINIFY=${DISABLE_MINIFY}

# Google Analytics measurement ID (optional, only set for production targets)
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID
ENV NEXT_PUBLIC_GA_MEASUREMENT_ID=${NEXT_PUBLIC_GA_MEASUREMENT_ID}

# Ensure public/ exists even if the repo has no static assets
RUN mkdir -p public && npm run build

# ---------------------------------------------------------------------------
# Stage 3: Production runner (minimal image)
# ---------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV AUTH_TRUST_HOST=true

# libstdc++ for native modules; vips for sharp image processing
RUN apk add --no-cache libstdc++ vips

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone server output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy public assets, i18n messages, and database migrations
COPY --from=builder /app/public ./public
COPY --from=builder /app/messages ./messages
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/docker ./docker

# Drizzle migration support: config + schema + dependencies needed by drizzle-kit push
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/scripts/load-env.ts ./scripts/load-env.ts
COPY --from=builder /app/src/lib/db ./src/lib/db
COPY --from=builder /app/src/lib/submissions/id.ts ./src/lib/submissions/id.ts
COPY --from=builder /app/src/types ./src/types

# PostgreSQL driver (pg) and all transitive dependencies
COPY --from=builder /app/node_modules/pg ./node_modules/pg
COPY --from=builder /app/node_modules/pg-connection-string ./node_modules/pg-connection-string
COPY --from=builder /app/node_modules/pg-int8 ./node_modules/pg-int8
COPY --from=builder /app/node_modules/pg-pool ./node_modules/pg-pool
COPY --from=builder /app/node_modules/pg-protocol ./node_modules/pg-protocol
COPY --from=builder /app/node_modules/pg-types ./node_modules/pg-types
COPY --from=builder /app/node_modules/pgpass ./node_modules/pgpass
COPY --from=builder /app/node_modules/postgres-array ./node_modules/postgres-array
COPY --from=builder /app/node_modules/postgres-bytea ./node_modules/postgres-bytea
COPY --from=builder /app/node_modules/postgres-date ./node_modules/postgres-date
COPY --from=builder /app/node_modules/postgres-interval ./node_modules/postgres-interval
COPY --from=builder /app/node_modules/split2 ./node_modules/split2
COPY --from=builder /app/node_modules/xtend ./node_modules/xtend

# sharp native module for image processing
COPY --from=builder /app/node_modules/sharp ./node_modules/sharp
COPY --from=builder /app/node_modules/@img ./node_modules/@img

# Runtime Drizzle config imports scripts/load-env.ts, which depends on @next/env.
COPY --from=builder /app/node_modules/@next/env ./node_modules/@next/env

# Data directory (for uploads, logs, etc.)
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
