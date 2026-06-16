#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="judgekit-playwright-db"
POSTGRES_IMAGE="postgres:18-alpine"
POSTGRES_PORT="55432"
POSTGRES_DB="judgekit"
POSTGRES_USER="judgekit"
POSTGRES_PASSWORD="judgekit_test"
SERVER_PORT="3110"
SERVER_HOST="localhost"
export DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}"

# The Next standalone server runs with NODE_ENV=production, so
# validateProductionConfig() (src/lib/security/production-config.ts) hard-exits
# unless every required secret is present, and getValidatedJudgeAuthToken()
# (src/lib/security/env.ts) rejects the known placeholders and any token shorter
# than 32 chars. For a throwaway local rendering/e2e server we mint strong
# ephemeral values for any unset required secret so the app can boot. Each is
# exported so `next build` and the running server share the same value.
mint_secret() {
  # mint_secret VARNAME — assigns a 64-char hex token to VARNAME if unset/empty.
  local var_name="$1"
  if [ -z "${!var_name:-}" ]; then
    printf -v "$var_name" '%s' "$(openssl rand -hex 32)"
  fi
  export "${var_name?}"
}

mint_secret JUDGE_AUTH_TOKEN
mint_secret CRON_SECRET
mint_secret CODE_SIMILARITY_AUTH_TOKEN
mint_secret RATE_LIMITER_AUTH_TOKEN
mint_secret NODE_ENCRYPTION_KEY

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

cleanup

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is required for local Playwright webServer startup." >&2
  exit 1
fi

docker run -d \
  --name "$CONTAINER_NAME" \
  -e POSTGRES_DB="$POSTGRES_DB" \
  -e POSTGRES_USER="$POSTGRES_USER" \
  -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  -p "${POSTGRES_PORT}:5432" \
  "$POSTGRES_IMAGE" >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$CONTAINER_NAME" pg_isready -U "$POSTGRES_USER" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

docker exec "$CONTAINER_NAME" pg_isready -U "$POSTGRES_USER" >/dev/null 2>&1

npm run db:push
npm run seed
npm run languages:sync
npm run build

# next.config.ts sets `output: "standalone"`, so `next start` is not the
# supported serve path under Next 16. The build emits a self-contained server at
# .next/standalone/server.js; it needs the static assets and public/ copied
# alongside it (the standard standalone serve recipe).
rm -rf .next/standalone/public .next/standalone/.next/static
cp -R public .next/standalone/public 2>/dev/null || true
mkdir -p .next/standalone/.next
cp -R .next/static .next/standalone/.next/static

PORT="$SERVER_PORT" HOSTNAME="$SERVER_HOST" node .next/standalone/server.js
