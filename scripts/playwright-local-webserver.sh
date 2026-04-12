#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="judgekit-playwright-db"
POSTGRES_IMAGE="postgres:18-alpine"
POSTGRES_PORT="55432"
POSTGRES_DB="judgekit"
POSTGRES_USER="judgekit"
POSTGRES_PASSWORD="judgekit_test"
export DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}"

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
npm run start -- --hostname localhost --port 3110
