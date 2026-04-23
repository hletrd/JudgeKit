# Security Review — RPF Cycle 47

**Date:** 2026-04-23
**Reviewer:** security-reviewer
**Base commit:** f8ba7334

## Inventory of Files Reviewed

- `src/lib/realtime/realtime-coordination.ts` — Verified cycle 46 clock-skew fix
- `src/lib/security/api-rate-limit.ts` — Rate limiting (Date.now analysis)
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` — Anti-cheat event logging
- `src/lib/assignments/recruiting-invitations.ts` — Recruiting token flow
- `src/proxy.ts` — Auth proxy (cache, FIFO eviction, session security)
- `src/lib/assignments/submissions.ts` — Submission validation
- `src/lib/security/password-hash.ts` — Password hashing
- `src/lib/security/encryption.ts` — Encryption utilities

## Previously Fixed Items (Verified)

- `realtime-coordination.ts` uses `getDbNowUncached()` for SSE slot/heartbeat: PASS
- Submission validation uses `getDbNowUncached()`: PASS
- Contest join route has explicit `auth: true`: PASS
- Access-code capability auth: PASS
- LIKE pattern escaping: PASS

## New Findings

### SEC-1: `checkServerActionRateLimit` uses `Date.now()` inside DB transaction — clock-skew in rate-limit enforcement [MEDIUM/MEDIUM]

**File:** `src/lib/security/api-rate-limit.ts:215`

**Description:** `checkServerActionRateLimit` captures `const now = Date.now()` and uses it inside `execTransaction` to compare against DB-stored `windowStartedAt` at line 234 (`existing.windowStartedAt + windowMs <= now`). This is the same clock-skew class fixed in `realtime-coordination.ts` (cycle 46) and `validateAssignmentSubmission` (cycle 45).

Unlike `atomicConsumeRateLimit` (deferred due to hot-path concerns), server actions are called infrequently (role edits, group management) and can tolerate the <1ms DB round-trip.

**Concrete failure scenario:** App clock 5 seconds ahead of DB. A user's rate-limit window was set at DB time 10:00:00 with a 60s window. At DB time 10:00:55, the app thinks it's 10:01:00. The check `10:00:00 + 60000 <= 10:01:00*1000` evaluates true, resetting the counter 5 seconds early. The user can perform more actions than the configured rate limit allows.

**Fix:** Use `getDbNowUncached()` at the start of the transaction.

**Confidence:** Medium

---

### Carry-Over Items

- **SEC-2 (from cycle 43):** Anti-cheat heartbeat dedup uses `Date.now()` for LRU cache (LOW/LOW, deferred — approximate by design)
- **Prior SEC-3:** Anti-cheat copies text content (LOW/LOW, deferred)
- **Prior SEC-4:** Docker build error leaks paths (LOW/LOW, deferred)
