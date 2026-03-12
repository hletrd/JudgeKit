#!/usr/bin/env bash

set -euo pipefail

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

print(f"Created verified backup: {target}")
PY

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
    find "$BACKUP_DIR" -name "judge-*.db" -o -name "judge-*.db.age" | while read -r f; do
        if [ "$(find "$f" -mtime +30 2>/dev/null)" ]; then
            rm -f "$f"
            echo "Removed old backup: $f"
        fi
    done
fi
