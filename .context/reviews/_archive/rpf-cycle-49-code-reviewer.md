# Cycle 49 — Code Reviewer

**Date:** 2026-04-23
**Base commit:** b6daa282

## Findings

### CR-1: ICPC leaderboard sort lacks deterministic userId tie-breaker [LOW/MEDIUM]

**File:** `src/lib/assignments/contest-scoring.ts:346-357`

**Description:** The IOI sort (line 359) was fixed in cycle 46 to include `a.userId.localeCompare(b.userId)` as a final tie-breaker, ensuring deterministic sort order. However, the ICPC sort (lines 346-357) has no such tie-breaker. If two users have the same solved count, total penalty, AND last AC time, the `sort` comparator returns 0, leaving relative order implementation-defined. This means the same tied users may appear in different order on different requests.

**Concrete failure scenario:** Two students solve the same 3 problems with identical total penalty and identical last-AC timestamps (possible when they submit in the same second). Without a userId tie-breaker, the leaderboard may show Alice before Bob on one request and Bob before Alice on another.

**Fix:** Add `|| a.userId.localeCompare(b.userId)` as a final tie-breaker in the ICPC sort, matching the IOI pattern.

---

### CR-2: Anti-cheat heartbeat LRU `Date.now()` dedup — carry-over [LOW/LOW]

**File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:92`

**Status:** Already deferred from cycle 43 (SEC-2). In-memory-only comparison, no cross-process clock skew concern.

---

### CR-3: `atomicConsumeRateLimit` uses `Date.now()` in hot path — carry-over [MEDIUM/MEDIUM]

**File:** `src/lib/security/api-rate-limit.ts:56`

**Status:** Already deferred from cycle 45 (AGG-2). Internally consistent but could drift across server instances.

---

### CR-4: Leaderboard freeze uses `Date.now()` — carry-over [LOW/LOW]

**File:** `src/lib/assignments/leaderboard.ts:52`

**Status:** Already deferred. Compares app-server time against DB `freeze_leaderboard_at`.

---

### CR-5: SSE O(n) eviction scan — carry-over [LOW/LOW]

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:44-55`

**Status:** Already deferred. O(n) scan of `connectionInfoMap` when exceeding cap.

---

## Sweep Notes

All previously fixed items from cycles 37-48 remain intact. No `Map.get()!` patterns found in current codebase. No `as any` casts found. No empty catch blocks. No `innerHTML` assignments or `eval` calls. The two `dangerouslySetInnerHTML` uses (`json-ld.tsx`, `problem-description.tsx`) are properly sanitized. The ICPC tie-breaker is the only new finding this cycle.
