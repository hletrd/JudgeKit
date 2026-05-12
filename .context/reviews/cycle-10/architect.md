# Architect — Cycle 10

**Date:** 2026-05-11
**HEAD reviewed:** `32554762`
**Change surface:** Cycle 9 fixes + plan archival.

---

## Findings

### C10-AR-1: SIGINT/SIGTERM handler consistency improves shutdown reliability (VERIFIED FIX)

**Confidence:** High
**File:** `src/lib/audit/node-shutdown.ts`

**Description:** The cycle 9 fix aligns SIGINT with SIGTERM behavior, removing the forced `process.exit(130)` call. This is architecturally correct: signal handlers should perform cleanup and let Node.js exit naturally. Forced exits can truncate in-flight I/O and prevent other registered handlers from running.

**Verification:** All three handlers (beforeExit, SIGTERM, SIGINT) are now structurally identical. The `flushAuditBuffer()` calls are consistently fire-and-forget (best-effort), which is the right tradeoff for shutdown scenarios.

---

### C10-AR-2: JSON parse validation pattern is consistently applied (VERIFIED)

**Confidence:** High
**Files:** Auth forms and problem creation form

**Description:** The `parseOk` pattern introduced in cycle 9 is a good architectural pattern for client-side fetch handling. It should be the standard for all new components that consume JSON APIs. The `apiFetchJson` and `parseApiResponse` helpers in `src/lib/api/client.ts` already encapsulate this pattern, so new code should prefer those helpers over manual parse tracking.

**Note:** The four files fixed in cycle 9 use manual `parseOk` tracking because they predate or don't use the `apiFetchJson` helper. No action needed — the manual pattern is correct and explicit.

---

## Deferred Architectural Items (unchanged)

- DEFER-7: `rateLimits` table overloaded (LOW)
- DEFER-9: SSE dual coordination paths (LOW)
- DEFER-10: Compiler dual code paths (LOW)
- C3-AGG-5: SSH-helpers modular extraction trigger (TRIPPED — next modification must extract or document deferral)

No new architectural findings identified.
