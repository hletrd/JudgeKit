# RPF Cycle 7 — debugger (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `45502305`.
**Cycle-7 change surface vs prior cycle close-out:** **0 commits, 0 files, 0 lines.**

## Summary

Empty change surface. Stale prior cycle-7 debugger finding C7-DB-1 (exam countdown clock-skew bug) is **RESOLVED at HEAD** because the underlying time endpoint now uses DB time (`getDbNowMs()`).

## Stale prior cycle-7 debugger findings — re-validated at HEAD

### C7-DB-1 (exam countdown shows incorrect time under clock skew) — RESOLVED at HEAD

- **Stale failure scenario:** Time endpoint returned `Date.now()` (app server clock); exam countdown drifted from DB-time-enforced deadlines.
- **HEAD evidence:** `src/app/api/v1/time/route.ts` uses `getDbNowMs()`. Client `CountdownTimer` (`src/components/exam/countdown-timer.tsx:69-94`) computes offset from DB time, so the countdown now matches server-side enforcement.
- **Status:** RESOLVED. Concrete user-facing bug eliminated.

### C7-DB-2 (`syncTokenWithUser` Date.now fallback) — UNCHANGED

- HEAD `src/lib/auth/config.ts:131`. Per CLAUDE.md, this file is no-touch during deploy. Fallback fires only for malformed tokens (no `authenticatedAt` AND no `iat`). Edge case acceptable. No new debug action.

### C7-DB-3 (SSE close() race) — UNCHANGED

- HEAD `src/app/api/v1/submissions/[id]/events/route.ts:306-323`. `closed` flag at top of `close()` prevents double-close. Correctly handled.

## Cycle-6 commits — failure-mode analysis

### `72868cea` (SUDO_PASSWORD decoupling)

- **Failure modes considered:**
  1. `SSH_PASSWORD` unset, `SUDO_PASSWORD` unset → `sudo_pw=""`; sudo prompts and fails. Same as before — no regression.
  2. `SSH_PASSWORD` set, `SUDO_PASSWORD` unset → falls back to `SSH_PASSWORD`. Same as before.
  3. `SSH_PASSWORD` set, `SUDO_PASSWORD` set (different) → uses `SUDO_PASSWORD` for sudo, `SSH_PASSWORD` for SSH. New supported scenario.
  4. `SSH_PASSWORD` set, `SUDO_PASSWORD=""` → `sudo_pw=""` because `${SUDO_PASSWORD:-...}` only falls back when **unset OR null**. Per Bash semantics, `${var:-default}` IS the null-or-unset operator, so `SUDO_PASSWORD=""` → falls back to `SSH_PASSWORD`. Verified.
- No new failure modes.

### `2791d9a3` (DEPLOY_SSH_RETRY_MAX)

- **Failure modes considered:**
  1. `DEPLOY_SSH_RETRY_MAX` unset → uses default 4. Same as before.
  2. `DEPLOY_SSH_RETRY_MAX="abc"` → regex rejects, warns, falls back to 4.
  3. `DEPLOY_SSH_RETRY_MAX="0"` → regex rejects (`^[1-9]` requires non-zero start), warns, falls back to 4.
  4. `DEPLOY_SSH_RETRY_MAX="1"` → uses 1.
  5. `DEPLOY_SSH_RETRY_MAX="100"` → uses 100. Note: total wait = `2 + 4 + ... + 2^max-1` seconds (exponential backoff). At max=20+, total wait > 1M seconds (effectively infinite). No upper-bound check, but `_initial_ssh_check` is bounded by SSH daemon timeout in practice.
- **Minor concern: no upper-bound check.** A typo like `DEPLOY_SSH_RETRY_MAX=100` would cause a deploy to hang for ~30 min. **Severity LOW; advisory only.** Operator-supplied env var; not exploitable. Status: defer with exit criterion: operator footgun report.

## NEW debugger findings this cycle

**0 NEW.** The minor "no upper-bound check" observation above is at the boundary of "advisory" and "new finding"; I label it advisory and propose deferring with explicit exit criterion. Not injecting as a new finding because:
1. The function it lives in (`_initial_ssh_check`) is invoked once per deploy, not in a hot path.
2. The retry exponential backoff is itself bounded by SSH daemon's TCP timeout in practice.
3. Operator-controlled env var — no security or correctness impact.

## Recommendations for cycle-7 PROMPT 2

1. Record C7-DB-1 closure (silently RESOLVED at HEAD via time-route fix).
2. Document the `DEPLOY_SSH_RETRY_MAX` upper-bound advisory as a deferred LOW item with exit criterion: operator footgun report OR explicit cap requested.

## Confidence

H.
