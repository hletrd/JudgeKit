# Cycle 49 — Security Reviewer

**Date:** 2026-04-23
**Base commit:** b6daa282

## Findings

### SEC-1: Anti-cheat heartbeat LRU cache Date.now() dedup — carry-over [LOW/LOW]

**File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:92`

**Status:** Already deferred from cycle 43. In-memory LRU comparison against same-process values. No cross-process clock skew concern. When `usesSharedRealtimeCoordination()` is true, the DB-based `shouldRecordSharedHeartbeat` (which uses `getDbNowUncached()`) is correctly used instead.

---

### SEC-2: `atomicConsumeRateLimit` Date.now() in hot path — carry-over [MEDIUM/MEDIUM]

**File:** `src/lib/security/api-rate-limit.ts:56`

**Status:** Already deferred from cycle 45. The `Date.now()` value is used both to write and read the rate-limit window, so comparisons are internally consistent within a single app-server instance. Cross-instance drift is the concern.

---

### SEC-3: Leaderboard freeze Date.now() comparison against DB timestamp — carry-over [LOW/LOW]

**File:** `src/lib/assignments/leaderboard.ts:52`

**Status:** Already deferred. `nowMs = Date.now()` compared against `freezeAt` from DB `freeze_leaderboard_at`.

---

### SEC-4: Docker build error leaks paths — carry-over [LOW/LOW]

**Status:** Already deferred from prior cycles.

---

### SEC-5: Anti-cheat copies user text content — carry-over [LOW/LOW]

**Status:** Already deferred from prior cycles.

---

## Sweep Notes

No new security issues found. The `sanitizeHtml` function properly restricts tags and attributes. The `safeJsonForScript` function correctly escapes `</script` and `<!--` sequences. The CSP in `proxy.ts` is properly configured with nonce-based scripts. No `eval` or `innerHTML` usage found. No secrets or credentials in source code.
