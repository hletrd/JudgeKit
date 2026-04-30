# Tracer — RPF Cycle 5 (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `2626aab6`
**Cycle change surface vs cycle-4 close-out:** EMPTY.

## Trace 1: SSH ControlMaster path is stable across cycles

Path: `deploy-docker.sh` → `_setup_ssh_control_master` (l.140-160) → `mktemp -d -t judgekit-ssh.XXXXXX` → 0700 dir → ControlPath=/tmp/judgekit-ssh.<rand>/cm-%h.

Cycle-2 fix `66146861` placed the dir in `/tmp` (instead of `${TMPDIR}` which had stale macOS sandbox path). Cycle-4 added defense-in-depth comment (commit `f5ac57ff`). Verifier-cycle-5 confirms unchanged at HEAD `2626aab6`. Behavior: identical to cycle-4 deploy log, 0 "Permission denied" lines.

## Trace 2: drizzle-kit push policy

Path: `deploy-docker.sh` → `db:push` → `npx drizzle-kit push --force=$DRIZZLE_PUSH_FORCE`. AGENTS.md "Drizzle push policy" subsection: `DRIZZLE_PUSH_FORCE=1` set ONLY when destructive diff is anticipated and approved. Cycle-4 deploy log: `[i] No changes detected`, no force needed. Cycle-5 directive (orchestrator): same — must NOT preemptively set `DRIZZLE_PUSH_FORCE=1`.

## Trace 3: deploy script env-var coverage

`deploy-docker.sh:1-30` header documents 8 env vars. Body usage check (grep for each var):
- `SKIP_LANGUAGES`: used to gate language image build.
- `SKIP_BUILD`: used to gate Docker build.
- `BUILD_WORKER_IMAGE`: used to gate worker image build.
- `INCLUDE_WORKER`: used to gate worker container start/stop.
- `LANGUAGE_FILTER`: used to filter language images.
- `SKIP_PREDEPLOY_BACKUP`: used to skip predeploy backup.
- `AUTH_URL_OVERRIDE`: used to override AUTH_URL in `.env`.
- `DRIZZLE_PUSH_FORCE`: used to set drizzle-kit force.

All 8 docs match body usage. No drift.

## NEW findings

**None.**

## Confidence

**High.** Direct trace.
