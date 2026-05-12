# Performance Reviewer — Cycle 10

**Date:** 2026-05-11
**HEAD reviewed:** `32554762`
**Change surface:** Cycle 9 fixes + plan archival.
**Files examined:** Modified timer, shutdown, and form components, plus sweep of SSE and polling paths.

---

## Findings

### C10-PR-1: CountdownTimer no longer leaks concurrent sync requests (VERIFIED FIX)

**Confidence:** High
**File:** `src/components/exam/countdown-timer.tsx:192-193`

**Description:** Before cycle 9, rapid tab switching could queue multiple concurrent `/api/v1/time` requests because each `handleVisibilityChange` call started a new `syncTime()` without aborting the previous one.

The cycle 9 fix stores the cleanup function from `syncTime()` in `syncCleanupRef.current` and calls it before starting a new sync. This correctly prevents request queuing.

**Verification:** Code inspection confirms the abort-then-replace pattern. No concurrent requests possible on repeated visibility changes.

---

### C10-PR-2: Minor cleanup leak on unmount (LOW)

**Confidence:** Medium
**File:** `src/components/exam/countdown-timer.tsx:112-118, 210-216`

**Description:** See C10-CR-1 (code-reviewer). The mount effect cleanup and the timer effect cleanup do not abort `syncCleanupRef.current`. An in-flight fetch from a visibilitychange event could complete after unmount, briefly keeping the closure alive until the 5-second timeout fires or the fetch completes.

**Impact:** Very low. At most one stale closure per unmount. No memory accumulation. No user-visible effect.

---

## Deferred Performance Items (unchanged)

- DEFER-1: SSE unbounded `inArray` query (MEDIUM)
- DEFER-6: Anti-cheat heartbeat gap detection loads 5000 rows (LOW)
- DEFER-7: `rateLimits` table overloaded (LOW)
- DEFER-8: Audit-logs instructor scope N+1 queries (LOW)
- C9-AGG-4: apiFetch fallback timer leak in old browsers (LOW)

No new performance findings identified.
