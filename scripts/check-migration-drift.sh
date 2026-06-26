#!/usr/bin/env bash
# =============================================================================
# Migration journal drift guard.
#
# Production deploys via `drizzle-kit push` (live schema diff), so it is easy to
# change src/lib/db/schema.pg.ts without adding a migration. When that happens
# the migration journal (drizzle/pg) can no longer rebuild the database from
# scratch — which silently breaks DB-backed integration tests AND disaster
# recovery (rebuild-from-migrations). This is the root cause behind the
# discussion_posts / recruiting-columns / SMTP-columns drift fixed in the
# 0012/0019/0025 migrations.
#
# This guard fails if EITHER:
#   1. `drizzle-kit check` reports an inconsistent/colliding journal, or
#   2. `drizzle-kit generate` would produce a new migration — i.e. schema.pg.ts
#      has changes not yet captured in drizzle/pg.
#
# Neither check needs a live database (both compare schema.ts against the
# on-disk meta snapshots), so it is safe to run in CI without a DB service.
#
# Fix when it fails: run `npx drizzle-kit generate` locally and commit the new
# migration + snapshot (+ make the generated SQL idempotent if it re-emits
# objects earlier migrations already create — see drizzle/pg/0025 for the
# pattern).
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

# drizzle.config.ts reads process.env.DATABASE_URL at load time; generate/check
# never connect, but supply a dummy so config evaluation never errors in CI.
export DATABASE_URL="${DATABASE_URL:-postgres://drift:drift@127.0.0.1:5432/drift}"

echo "==> SQL file / journal bijection"
node <<'NODE'
const { readdirSync, readFileSync } = require("node:fs");
const { join, basename } = require("node:path");

const migrationDir = join(process.cwd(), "drizzle/pg");
const journal = JSON.parse(readFileSync(join(migrationDir, "meta/_journal.json"), "utf8"));
const sqlTags = new Set(
  readdirSync(migrationDir)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => basename(file, ".sql")),
);
const journalTags = new Set((journal.entries ?? []).map((entry) => entry.tag).filter(Boolean));

const missingFromJournal = [...sqlTags].filter((tag) => !journalTags.has(tag)).sort();
const missingSqlFiles = [...journalTags].filter((tag) => !sqlTags.has(tag)).sort();

if (missingFromJournal.length || missingSqlFiles.length) {
  if (missingFromJournal.length) {
    console.error(`::error::Migration SQL files missing from drizzle journal: ${missingFromJournal.join(", ")}`);
  }
  if (missingSqlFiles.length) {
    console.error(`::error::Drizzle journal entries missing SQL files: ${missingSqlFiles.join(", ")}`);
  }
  process.exit(1);
}
NODE

echo "==> drizzle-kit check (journal consistency)"
npx drizzle-kit check

echo "==> drizzle-kit generate (drift detection)"
before="$(git status --porcelain -- drizzle/ || true)"
gen_out="$(npx drizzle-kit generate --name ci_migration_drift_check 2>&1)" || {
  echo "$gen_out" >&2
  echo "ERROR: drizzle-kit generate failed" >&2
  exit 2
}
after="$(git status --porcelain -- drizzle/ || true)"

if [ "$before" != "$after" ]; then
  echo "::error::Migration drift detected — schema.pg.ts has changes not captured in drizzle/pg." >&2
  echo "Run 'npx drizzle-kit generate' locally and commit the new migration + snapshot." >&2
  git --no-pager diff --stat -- drizzle/ >&2 || true
  # Restore the workspace WITHOUT discarding developer changes. Revert only the
  # exact files the probe touched: tracked modifications via `git checkout`,
  # newly-created untracked files via targeted `rm`. Never `git clean -fd`,
  # which would delete a developer's untracked migration work under drizzle/.
  DRIFT_BEFORE="$before" DRIFT_AFTER="$after" node <<'NODE'
const { execFileSync } = require("node:child_process");
const { rmSync } = require("node:fs");

const before = new Set((process.env.DRIFT_BEFORE ?? "").split("\n").filter(Boolean));
const after = (process.env.DRIFT_AFTER ?? "").split("\n").filter(Boolean);

// Entries present after the probe but not before are the probe's footprint;
// developer files (in `before`) are left untouched.
for (const line of after.filter((entry) => !before.has(entry))) {
  // Porcelain v1: "XY <path>" (2 status chars + space + path). Renames are not
  // produced by drizzle-kit; paths may be quoted — strip quotes defensively.
  const path = line.slice(3).trim().replace(/^"|"$/g, "");
  if (!path) continue;
  if (line.startsWith("??")) {
    rmSync(path, { force: true });
  } else {
    try {
      execFileSync("git", ["checkout", "--", path], { stdio: "ignore" });
    } catch {
      // Best-effort cleanup; the drift error is the real signal below.
    }
  }
}
NODE
  exit 1
fi

echo "$gen_out" | tail -1
echo "✓ Migration journal is in sync with schema.pg.ts (no drift)."
