# User-Injected TODOs for Next Cycle

## 1. Move workspace-only pages to public with new top navbar layout (ONGOING)

**Priority: High**
**Status: RESOLVED (RPF cycle-6, 2026-06-12)** — All phases complete. Evidence: the migration plan was archived as `plans/archive/2026-04-29-archived-workspace-to-public-migration.md` with "ALL PHASES COMPLETE"; no `(workspace)` route group exists under `src/app` (route groups today: `(auth)`, `(dashboard)`, `(public)`); the unified top navbar ships in the `(public)` layout. No action remaining.

## 2. Fix rsync overwriting remote .env on worker server

**Priority: Medium**
**Status: RESOLVED (cycle 22)** — Verified that no rsync command in any deploy script overwrites the remote `.env`. `deploy-docker.sh` uses `--exclude='.env*'` (line 299). `deploy-worker.sh` uses `ensure_env_var()` (Python-based per-key update) instead of rsync and explicitly preserves remote-only keys (line 93 comment). `deploy-test-backends.sh` excludes `.env` and `.env.production` (lines 86-87). No action needed.

## 3. Deploy-docker.sh should handle COMPILER_RUNNER_URL for algo target

**Priority: Medium**
**Status: RESOLVED (RPF cycle-6, 2026-06-12)** — `deploy-docker.sh` auto-injects the key: `ensure_env_literal "COMPILER_RUNNER_URL" "http://host.docker.internal:3001"` (line 657) runs for app-only targets, with a drift warning when the remote value differs (lines 663-666). Verified across the cycle-4/5 three-target deploys (algo leg green with `INCLUDE_WORKER=false`). No action remaining.
