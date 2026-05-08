# Debugger — Cycle 8 (Loop 8/100)

**Date:** 2026-04-24
**HEAD commit:** c5644a05

## Methodology

Latent bug surface analysis: failure modes, edge cases, error-handling gaps, race conditions, and state-consistency issues. Examined all error paths and edge cases in critical flows.

## Findings

**No new bug findings this cycle.**

### Potential Failure Modes Reviewed (All Mitigated)

1. **SSE connection leak on process crash** — `src/app/api/v1/submissions/[id]/events/route.ts`. If the process crashes, in-memory connection tracking is lost. For shared coordination mode, the DB entries have `blockedUntil` with expiry, so they self-clean. For process-local mode, connections reset on restart. Acceptable trade-off documented in code.

2. **Concurrent recruiting token redemption** — `src/lib/assignments/recruiting-invitations.ts:304-543`. The atomic SQL `UPDATE ... WHERE status = 'pending' AND (expiresAt IS NULL OR expiresAt > NOW())` with `RETURNING` handles this correctly. If two requests race, only one gets a row back.

3. **Password rehash failure during verify** — `src/lib/security/password-hash.ts:65-66`. If the rehash `UPDATE` fails, it logs the error but still returns `{ valid: true }`. This is correct — the user should not be blocked from logging in because a rehash failed.

4. **Settings cache failure** — `src/lib/system-settings-config.ts:121-128,172-173`. If DB load fails, defaults are used. This is correct — the system should remain functional with hardcoded defaults.

5. **Compiler runner fallback** — `src/lib/compiler/execute.ts:557-579`. If the Rust runner is unavailable, the system falls back to local Docker execution (if allowed) or returns an error. This is correctly gated by configuration flags.

6. **Race in settings invalidation** — `invalidateSettingsCache()` sets `cached = null`. If `getConfiguredSettings()` is called concurrently, the `if (!_refreshing)` guard prevents duplicate reloads. The stale-or-defaults return is acceptable.

### Carry-Over Deferred Items

All previously deferred items remain unchanged.

## Files Reviewed

`src/lib/assignments/recruiting-invitations.ts`, `src/lib/security/password-hash.ts`, `src/lib/system-settings-config.ts`, `src/lib/compiler/execute.ts`, `src/app/api/v1/submissions/[id]/events/route.ts`, `src/lib/realtime/realtime-coordination.ts`, `src/lib/auth/config.ts`, `src/lib/auth/session-security.ts`
