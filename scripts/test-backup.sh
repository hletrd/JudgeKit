#!/usr/bin/env bash
# Smoke test for scripts/backup-db.sh
# Creates a temporary SQLite database, runs the backup script, verifies the output, then cleans up.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="$SCRIPT_DIR/backup-db.sh"

# Syntax check first
bash -n "$BACKUP_SCRIPT"
echo "Syntax check passed: backup-db.sh"

# Create a temp workspace
TMPDIR_TEST="$(mktemp -d)"
cleanup() {
    rm -rf "$TMPDIR_TEST"
}
trap cleanup EXIT

SOURCE_DB="$TMPDIR_TEST/judge.db"
BACKUP_DB="$TMPDIR_TEST/backups/judge-test.db"

# Create a minimal SQLite database with one table and one row
python3 - "$SOURCE_DB" <<'PY'
import sqlite3
import sys

conn = sqlite3.connect(sys.argv[1])
conn.execute("CREATE TABLE smoke (id INTEGER PRIMARY KEY, val TEXT)")
conn.execute("INSERT INTO smoke VALUES (1, 'hello')")
conn.commit()
conn.close()
print(f"Created source DB: {sys.argv[1]}")
PY

# Run the backup script against the temporary database
SOURCE_DB="$SOURCE_DB" bash "$BACKUP_SCRIPT" "$BACKUP_DB"

# Verify the backup file exists
if [ ! -f "$BACKUP_DB" ]; then
    echo "FAIL: Backup file not found at $BACKUP_DB" >&2
    exit 1
fi

# Verify the backup contains the expected data
python3 - "$BACKUP_DB" <<'PY'
import sqlite3
import sys

conn = sqlite3.connect(sys.argv[1])
row = conn.execute("SELECT val FROM smoke WHERE id = 1").fetchone()
conn.close()

if row is None or row[0] != "hello":
    raise SystemExit(f"FAIL: Unexpected row in backup: {row}")

print(f"Data integrity verified: {row[0]!r}")
PY

echo "All backup smoke tests passed."
