#!/usr/bin/env bash
# Verify a database backup — PostgreSQL (.sql.gz) is the active runtime format;
# SQLite (.db) verification remains for historical backups only.
set -euo pipefail

if [ "$#" -lt 1 ]; then
  printf 'Usage: %s <backup-path> [restore-path]\n' "$0" >&2
  exit 1
fi

BACKUP_PATH="$1"

if [[ "$BACKUP_PATH" == *.sql.gz ]]; then
  # --- PostgreSQL backup verification ---
  if ! gzip -t "$BACKUP_PATH" 2>/dev/null; then
    echo "ERROR: Backup is not valid gzip: $BACKUP_PATH" >&2
    exit 1
  fi

  # Check it contains SQL statements
  LINE_COUNT=$(zcat "$BACKUP_PATH" | head -100 | wc -l)
  if [ "$LINE_COUNT" -lt 1 ]; then
    echo "ERROR: Backup appears empty: $BACKUP_PATH" >&2
    exit 1
  fi

  # Full restore-test. The gzip + non-empty checks above still PASS for a
  # truncated-but-valid-gzip dump, so they don't prove restorability. When a
  # throwaway PostgreSQL target is provided (RESTORE_DATABASE_URL, or the 2nd
  # arg — a base DSN whose role can CREATE DATABASE), actually restore the dump
  # into a fresh temp database, assert it contains tables, then drop it.
  RESTORE_DSN="${RESTORE_DATABASE_URL:-${2:-}}"
  if [ -n "$RESTORE_DSN" ]; then
    command -v psql >/dev/null 2>&1 || { echo "ERROR: psql not on PATH for restore-test" >&2; exit 1; }
    TMP_DB="verify_restore_$(date +%s)_$$"
    cleanup_restore() {
      psql "$RESTORE_DSN" -c "DROP DATABASE IF EXISTS \"$TMP_DB\"" >/dev/null 2>&1 || true
    }
    trap cleanup_restore EXIT

    if ! psql "$RESTORE_DSN" -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE \"$TMP_DB\"" >/dev/null; then
      echo "ERROR: could not create temp restore database $TMP_DB" >&2
      exit 1
    fi
    # Point the DSN at the temp database (replace the db-name path segment).
    TARGET_DSN="$(printf '%s' "$RESTORE_DSN" | sed -E "s#(://[^/]+)/[^?]*#\1/$TMP_DB#")"

    if ! zcat "$BACKUP_PATH" | psql "$TARGET_DSN" -v ON_ERROR_STOP=1 -q >/dev/null; then
      echo "ERROR: restore into $TMP_DB failed — backup is not restorable: $BACKUP_PATH" >&2
      exit 1
    fi

    TABLE_COUNT="$(psql "$TARGET_DSN" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" | tr -d '[:space:]')"
    if [ "${TABLE_COUNT:-0}" -lt 1 ]; then
      echo "ERROR: restored database has no tables — backup is incomplete: $BACKUP_PATH" >&2
      exit 1
    fi

    cleanup_restore
    trap - EXIT
    echo "PostgreSQL backup verified by FULL RESTORE: $BACKUP_PATH ($TABLE_COUNT tables restored into a throwaway DB, then dropped)"
  else
    echo "PostgreSQL backup verified: $BACKUP_PATH (valid gzip, contains SQL)."
    echo "NOTE: full restore-test skipped — set RESTORE_DATABASE_URL to a PostgreSQL base DSN with CREATE DATABASE rights to verify the dump actually restores."
  fi

else
  # --- SQLite backup verification ---
  if [ "$#" -ge 2 ]; then
    RESTORE_PATH="$2"
  else
    RESTORE_PATH="$(mktemp "${TMPDIR:-/tmp}/online-judge-restore-XXXXXX.db")"
    rm -f "$RESTORE_PATH"
  fi

  python3 - "$BACKUP_PATH" "$RESTORE_PATH" <<'PY'
from pathlib import Path
import sqlite3
import sys

backup = Path(sys.argv[1])
restore = Path(sys.argv[2])

if not backup.exists():
    raise SystemExit(f"Backup database does not exist: {backup}")

if restore.exists():
    raise SystemExit(f"Restore target already exists: {restore}")

restore.parent.mkdir(parents=True, exist_ok=True)

with sqlite3.connect(f"file:{backup}?mode=ro", uri=True) as backup_db:
    with sqlite3.connect(restore) as restore_db:
        backup_db.backup(restore_db)
        integrity = restore_db.execute("pragma integrity_check;").fetchone()

if integrity is None or integrity[0] != "ok":
    raise SystemExit(f"Restore integrity check failed for {restore}: {integrity}")

print(f"Verified backup restore: {restore}")
PY
fi
