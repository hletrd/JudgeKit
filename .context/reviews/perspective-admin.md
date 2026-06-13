# Perspective: Platform Admin — RPF Cycle 8 (2026-06-13)

**HEAD:** c862ff72.

## AD8-1 — Latent inconsistent-data class: access-code tokens carry a non-canonical expiry (MEDIUM via CR8-1)
**File:** `access-codes.ts:191`. Operationally this means the
`contest_access_tokens` table contains rows whose `expires_at` does NOT follow
the documented rule (`lateDeadline ?? deadline`) — specifically every token
created via access-code redemption on a contest that has a `lateDeadline`. Unlike
the pre-cycle-6 rows, these are still being *created* wrong today. Note:
schedule-edit sync retro-repairs them, but only if an edit occurs. As an admin
debugging a "student says contest disappeared" ticket, the data won't match the
spec, which costs investigation time. Fix at the source stops new bad rows; a
one-off `UPDATE` could repair existing rows but is not required (next edit heals
them, and the value is restrictive not permissive).

## Ops posture (confirmed healthy)
- tsc/eslint/lint:bash/unit all green on HEAD. Deploy story unchanged
  (worv + algo app-only per-cycle; algo keeps SKIP_LANGUAGES/BUILD_WORKER_IMAGE
  /INCLUDE_WORKER off). Backups + restore-test wired (abfa90f5).
- No `docker system prune --volumes` anywhere in deploy scripts. ✅

## Carried (ops): CI-RESTORE (wire RESTORE_DATABASE_URL into CI), DEFER-ENV-GATES
(provisioned staging for E2E/browser a11y). No CI/staging change this cycle.
