#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -lt 1 ]; then
  printf 'Usage: %s <backup-path> [restore-path]\n' "$0" >&2
  exit 1
fi

BACKUP_PATH="$1"

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
