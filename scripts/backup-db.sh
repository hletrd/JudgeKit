#!/usr/bin/env bash
# Database backup script — supports PostgreSQL (production) and SQLite (dev)
#
# PostgreSQL modes:
#   host-exec     (default): requires host-level pg_dump; reads DATABASE_URL
#   container-exec          : runs pg_dump inside a docker container, no host
#                             dependency. Enable by setting CONTAINER_NAME.
#                             Reads POSTGRES_PASSWORD / DB_NAME / DB_USER from
#                             env, or from ENV_FILE if set.
#
# Suitable for daily cron on a production host:
#   CONTAINER_NAME=judgekit-db \
#     ENV_FILE=/home/ubuntu/judgekit/.env.production \
#     BACKUP_PATH=/home/ubuntu/backups/judgekit-$(date +%Y%m%d-%H%M%S).sql.gz \
#     /home/ubuntu/judgekit/scripts/backup-db.sh
set -euo pipefail

DB_DIALECT="${DB_DIALECT:-sqlite}"

if [ "$DB_DIALECT" = "postgresql" ]; then
  BACKUP_PATH="${1:-${BACKUP_PATH:-data/backups/judge-$(date +%Y%m%d-%H%M%S).sql.gz}}"
  mkdir -p "$(dirname "$BACKUP_PATH")"

  if [ -n "${CONTAINER_NAME:-}" ]; then
    # --- container-exec mode: run pg_dump inside a docker container ---
    command -v docker >/dev/null 2>&1 || { echo "ERROR: docker not found on PATH" >&2; exit 1; }
    docker inspect "${CONTAINER_NAME}" >/dev/null 2>&1 \
      || { echo "ERROR: container ${CONTAINER_NAME} not found" >&2; exit 1; }
    docker inspect --format='{{.State.Running}}' "${CONTAINER_NAME}" 2>/dev/null | grep -q true \
      || { echo "ERROR: container ${CONTAINER_NAME} is not running" >&2; exit 1; }

    DB_NAME="${DB_NAME:-judgekit}"
    DB_USER="${DB_USER:-judgekit}"
    PG_PASS="${POSTGRES_PASSWORD:-}"
    if [ -z "${PG_PASS}" ] && [ -n "${ENV_FILE:-}" ] && [ -f "${ENV_FILE}" ]; then
      PG_PASS=$(grep -E '^POSTGRES_PASSWORD=' "${ENV_FILE}" | cut -d= -f2- | head -1 || true)
    fi
    [ -n "${PG_PASS}" ] || { echo "ERROR: POSTGRES_PASSWORD is required (set POSTGRES_PASSWORD or ENV_FILE)" >&2; exit 1; }

    timeout 600s docker exec -e PGPASSWORD="${PG_PASS}" "${CONTAINER_NAME}" \
      pg_dump -U "${DB_USER}" -d "${DB_NAME}" | gzip > "$BACKUP_PATH"
    echo "Created PostgreSQL backup via ${CONTAINER_NAME}: $BACKUP_PATH"
  else
    # --- host-exec mode: requires host-level pg_dump ---
    DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required for PostgreSQL backup (or set CONTAINER_NAME for container-exec mode)}"
    command -v pg_dump >/dev/null 2>&1 || { echo "ERROR: pg_dump not on PATH (install postgresql-client or set CONTAINER_NAME for container-exec mode)" >&2; exit 1; }
    timeout 300s pg_dump "$DATABASE_URL" | gzip > "$BACKUP_PATH"
    echo "Created PostgreSQL backup: $BACKUP_PATH"
  fi

  # Verify the backup is a valid gzip
  if ! gzip -t "$BACKUP_PATH" 2>/dev/null; then
    echo "ERROR: Backup verification failed — file is not valid gzip" >&2
    exit 1
  fi
  echo "Backup verified (valid gzip)"

else
  # --- SQLite backup via Python ---
  SOURCE_DB="${SOURCE_DB:-data/judge.db}"
  BACKUP_PATH="${1:-data/backups/judge-$(date +%Y%m%d-%H%M%S).db}"

  python3 - "$SOURCE_DB" "$BACKUP_PATH" <<'PY'
from pathlib import Path
import sqlite3
import sys

source = Path(sys.argv[1])
target = Path(sys.argv[2])

if not source.exists():
    raise SystemExit(f"Source database does not exist: {source}")

target.parent.mkdir(parents=True, exist_ok=True)

with sqlite3.connect(f"file:{source}?mode=ro", uri=True) as source_db:
    with sqlite3.connect(target) as backup_db:
        source_db.backup(backup_db)
        integrity = backup_db.execute("pragma integrity_check;").fetchone()

if integrity is None or integrity[0] != "ok":
    raise SystemExit(f"Backup integrity check failed for {target}: {integrity}")

print(f"Created verified SQLite backup: {target}")
PY
fi

# Encrypt backup if age is available (install: https://github.com/FiloSottile/age)
AGE_RECIPIENT="${AGE_RECIPIENT:-}"
if [ -n "$AGE_RECIPIENT" ] && command -v age >/dev/null 2>&1; then
    age -r "$AGE_RECIPIENT" -o "${BACKUP_PATH}.age" "$BACKUP_PATH"
    rm -f "$BACKUP_PATH"
    echo "Encrypted backup: ${BACKUP_PATH}.age"
fi

# Retention policy: remove backups older than 30 days
BACKUP_DIR="$(dirname "$BACKUP_PATH")"
if [ -d "$BACKUP_DIR" ]; then
    find "$BACKUP_DIR" -maxdepth 1 \( -name "judge-*.db" -o -name "judge-*.db.age" -o -name "judge-*.sql.gz" -o -name "judge-*.sql.gz.age" \) | while read -r f; do
        if [ "$(find "$f" -mtime +30 2>/dev/null)" ]; then
            NEWER_COUNT=$(find "$BACKUP_DIR" -maxdepth 1 \( -name "judge-*.db" -o -name "judge-*.sql.gz" \) -mtime -30 2>/dev/null | wc -l)
            if [ "$NEWER_COUNT" -gt 0 ]; then
                rm -f "$f"
                echo "Removed old backup: $f"
            else
                echo "WARNING: Skipping deletion of $f -- no newer backups exist" >&2
            fi
        fi
    done
fi
