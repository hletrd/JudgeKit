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

# Install build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# Stage 2: Build the Next.js application
# ---------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

# Build tools needed for better-sqlite3 rebuild during build
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

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3: Production runner (minimal image)
# ---------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# better-sqlite3 requires libstdc++ at runtime; Docker CLI for admin image management
RUN apk add --no-cache libstdc++ docker-cli

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    addgroup -g 987 docker 2>/dev/null || true && \
    addgroup nextjs docker 2>/dev/null || true

# Copy standalone server output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy public assets, i18n messages, and database migrations
COPY --from=builder /app/public ./public
COPY --from=builder /app/messages ./messages
COPY --from=builder /app/drizzle ./drizzle

# better-sqlite3 native module — standalone doesn't bundle native addons
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder /app/node_modules/bindings ./node_modules/bindings
COPY --from=builder /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

# Data directory for SQLite (mount a volume here)
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
