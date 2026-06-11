# RPF Cycle 3 — Architect

**Date:** 2026-04-29
**HEAD reviewed:** 66146861
**Scope:** Architectural risks, coupling, layering, deploy-pipeline structure.

## Cycle change surface

`deploy-docker.sh` only — bash script, ≈1001 lines.

### Architectural review of the SSH multiplexing addition

The `_initial_ssh_check`, `SSH_CONTROL_DIR`, `_cleanup_ssh_master`, and `EXIT` trap are well-placed (lines 140-178, before the four `remote*` helpers and before the pre-flight checks). The trap registers immediately after `mktemp -d`, ensuring early failures (between mktemp and the first remote call) still clean up.

However, two architectural smells are visible:

**C3-AR-1 [LOW] `deploy-docker.sh` is now ≈1001 lines and conflates concerns.**
- File: `deploy-docker.sh` (whole file).
- Severity: LOW.
- Confidence: HIGH.
- Rationale: The script handles arg parsing, env loading, SSH client config, `.env.production` generation, source rsync, drizzle-kit push, secret_token backfill, ANALYZE, container orchestration, nginx config templating, TLS detection, deployment verification, and summary output. Each of these is independently a candidate for extraction:
  - SSH helpers + `_initial_ssh_check` → `scripts/lib/ssh.sh`.
  - `.env.production` generation + `ensure_env_*` → `scripts/lib/env.sh`.
  - drizzle migration logic + secret_token backfill → `scripts/lib/migrate.sh`.
  - nginx config heredoc → `scripts/lib/nginx-config.sh.tpl` (a template file plus an envsubst step).
- The current monolith works, but every cycle that touches one concern (cycle 1: SKIP_LANGUAGES; cycle 2: chmod 0600; cycle 2: ControlMaster) edits the same file, which makes diff history less reviewable and increases the chance of accidental cross-concern regressions.
- Concrete failure scenario: Future cycle adds a new SSH option for a different target. The change accidentally affects the nginx config heredoc because the var expansion order changed. Hard to catch in a 1001-line diff without modular split.
- Suggested fix: Extract SSH helpers (lines 135-214) into `scripts/lib/ssh.sh`, source it from `deploy-docker.sh`. Lowest-risk first refactor.
- Status: LOW, deferrable. Exit criterion: deploy-docker.sh exceeds 1500 lines, OR three independent cycles modify the SSH-helpers block.

**C3-AR-2 [LOW] Duplicate deploy script `deploy.sh` (54 lines) and `deploy-docker.sh` (1001 lines) — deploy.sh has not been updated to follow ControlMaster.**
- File/lines: `deploy.sh:58-66` (still uses bare `sshpass -p "$SSH_PASSWORD" ssh $SSH_OPTS ...`, no ControlMaster).
- Severity: LOW.
- Confidence: HIGH (verified by grep).
- Rationale: `deploy.sh` (the legacy non-Docker deploy entrypoint) does not benefit from the cycle-2 ControlMaster fix. If it's still invoked anywhere (CI, manual), it would suffer the same sshpass MaxStartups throttling that cycle-2 resolved for `deploy-docker.sh`. If it's NOT invoked anymore, it should be deleted or moved to `scripts/_legacy/`.
- Concrete failure scenario: Operator falls back to `./deploy.sh` when `deploy-docker.sh` is unavailable; sees the same "Permission denied" pattern that cycle 2 was supposed to fix. Confused.
- Suggested fix: Either (a) port the SSH ControlMaster block into `deploy.sh` (5-10 line change), or (b) delete `deploy.sh` if unused, or (c) print "Deprecated: use deploy-docker.sh" at the top.
- Status: LOW, deferrable. Exit criterion: `deploy.sh` is invoked in the next 90 days (telemetry / log evidence) OR it gets touched for any reason.

### Carry-forward architectural findings

**C2-AGG-5 [LOW — DEFERRED] Visibility-aware polling pattern duplicated.**
- Status: UNCHANGED. 14 `visibilitychange` listeners in `src/`, 4-6 components implementing the same pattern. No 7th instance added this cycle.
- Carry-forward.

**ARCH-CARRY-1 [MEDIUM — DEFERRED] 22+ raw API route handlers haven't migrated to `createApiHandler`.**
- File: `src/app/api/**/route.ts`.
- Status: UNCHANGED.
- Carry-forward.

**ARCH-CARRY-2 [LOW — DEFERRED] SSE connection-tracking eviction is O(n) per disconnect.**
- File: `src/lib/realtime/`.
- Status: UNCHANGED.
- Carry-forward.

## Layering / coupling sweep (no new findings)

- App router boundaries (`src/app/(public)`, `(dashboard)`, `(auth)`, `(control)`) — `(control)` is empty (verified via `find`), confirming cycle-1's workspace→public migration is done. No new cross-tier imports observed.
- `src/lib` vs `src/components` import direction — same as cycle-2 baseline; no new violations.
- Server / client component boundary — no new `"use client"` regressions in this cycle's diff (no `src/` changes).

## Summary

- 2 new LOW architectural findings (C3-AR-1, C3-AR-2) — both deploy-script structural concerns.
- All carry-forward arch findings unchanged.
- No new layering or coupling violations.

**Total new findings this cycle:** 2 LOW.
