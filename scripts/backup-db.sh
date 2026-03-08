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
