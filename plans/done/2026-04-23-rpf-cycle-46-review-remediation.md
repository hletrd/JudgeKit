# Cycle 46 Review Remediation Plan

**Date:** 2026-04-23
**Cycle:** 46/100
**Base commit:** 54cb92ed

## Findings to Address

### Lane 1: Replace `Date.now()` with `getDbNowUncached()` in `realtime-coordination.ts` [MEDIUM/MEDIUM]

**Source:** AGG-1 (6-agent consensus: SEC-1, ARCH-1, CRI-2, DBG-1, TE-2, TR-1)

**Files:**
- `src/lib/realtime/realtime-coordination.ts:88` — `acquireSharedSseConnectionSlot`
- `src/lib/realtime/realtime-coordination.ts:148` — `shouldRecordSharedHeartbeat`

**Changes:**
1. Import `getDbNowUncached` from `@/lib/db-time`
2. In `acquireSharedSseConnectionSlot`: replace `const nowMs = Date.now();` with `const nowMs = (await getDbNowUncached()).getTime();` inside the `withPgAdvisoryLock` callback
3. In `shouldRecordSharedHeartbeat`: replace `const nowMs = Date.now();` with `const nowMs = (await getDbNowUncached()).getTime();` inside the `withPgAdvisoryLock` callback
4. Add a comment explaining the clock-skew rationale
5. Verify existing tests still pass (the functions are already async)

**Exit criteria:** Both functions use DB time for all comparisons against DB-stored `rateLimits` columns.

---

### Lane 2: Replace non-null assertions on `Map.get()` in contests page [MEDIUM/MEDIUM]

**Source:** AGG-2 (4-agent consensus: CR-1, CRI-1, V-1, TE-1)

**Files:**
- `src/app/(dashboard)/dashboard/contests/page.tsx:109`
- `src/app/(dashboard)/dashboard/contests/page.tsx:178`

**Changes:**
1. Line 109: Replace `statusMatchesFilter(statusMap.get(c.id)!, filter)` with `statusMatchesFilter(statusMap.get(c.id) ?? "closed", filter)`
2. Line 178: Replace `const status = statusMap.get(contest.id)!;` with `const status = statusMap.get(contest.id) ?? "closed";`

**Exit criteria:** No `Map.get()!` patterns remain in contests/page.tsx.

---

### Lane 3: Replace remaining non-null assertions in candidate-dashboard and practice page [LOW/LOW]

**Source:** AGG-4 (1-agent: CR-2, CR-3)

**Files:**
- `src/app/(dashboard)/dashboard/_components/candidate-dashboard.tsx:595`
- `src/app/(public)/practice/page.tsx:129`

**Changes:**
1. candidate-dashboard.tsx:595: Replace `.get(assignment.assignmentId)!` with `.get(assignment.assignmentId) ?? []` and use the result
2. practice/page.tsx:129: Replace `resolvedSearchParams!.sort as SortOption` with `resolvedSearchParams?.sort as SortOption`

**Exit criteria:** No `Map.get()!` patterns in candidate-dashboard.tsx; no `!` assertion on `resolvedSearchParams` in practice/page.tsx.

---

### Lane 4: Add deterministic tie-breaking to IOI leaderboard sort [LOW/LOW]

**Source:** AGG-5 (1-agent: CR-4)

**File:**
- `src/lib/assignments/contest-scoring.ts:359`

**Changes:**
1. Replace `entries.sort((a, b) => b.totalScore - a.totalScore)` with `entries.sort((a, b) => b.totalScore - a.totalScore || a.userId.localeCompare(b.userId))`

**Exit criteria:** IOI leaderboard sort has a deterministic secondary key.

---

## Deferred Items (from this cycle's reviews)

| Finding | File+Line | Severity/Confidence | Reason for Deferral | Exit Criterion |
|---------|-----------|-------------------|--------------------|---------------|
| AGG-3: Rate-limit header Date.now() for reset | api-rate-limit.ts:124 | LOW/LOW | Header-only inaccuracy; enforcement is internally consistent | API clients report retry-after issues |
| AGG-6: Contests page badge hardcoded colors | contests/page.tsx:224 | LOW/LOW | Visual-only; current colors have adequate contrast | Dark mode audit |

All prior deferred items from cycles 37-45 remain deferred as documented in `_aggregate.md`.

## Progress

- [x] Lane 1: realtime-coordination.ts clock-skew fix (commit e557daf0)
- [x] Lane 2: Contests page Map.get()! fix (commit cecd1803)
- [x] Lane 3: Candidate-dashboard and practice page non-null assertion fix (commit b79473d8)
- [x] Lane 4: IOI leaderboard deterministic tie-breaking (commit 8a33d89e)
