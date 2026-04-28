# Performance Review — Cycle 1 (New Session)

**Reviewer:** perf-reviewer
**Date:** 2026-04-28
**Scope:** Full repository performance analysis

---

## Findings

### PERF-1: [MEDIUM] Public contest detail page makes N+1-style sequential queries for enrolled users

**File:** `src/app/(public)/contests/[id]/page.tsx:123-169`
**Confidence:** MEDIUM

For enrolled users, the page makes these sequential queries:
1. `auth()` — session check
2. `getUserContestAccess(id, ...)` — checks enrollment/management (queries assignment + enrollment + access tokens)
3. `getEnrolledContestDetail(id, ...)` — queries assignment again + enrollment again + exam sessions
4. `getStudentProblemStatuses(...)` — problem statuses
5. `mySubmissions` query — submission history
6. `getResolvedSystemTimeZone()` — timezone
7. `getExamSession(...)` — exam session again

Steps 2 and 3 both query the same assignment row and check enrollment. Step 6 queries exam session, and step 7 queries it again. This is 2-3 redundant DB roundtrips per page load.

**Failure scenario:** Under load (e.g., 500 students starting a timed exam simultaneously), these redundant queries contribute to DB connection pool exhaustion.

**Fix:** Merge `getUserContestAccess` and `getEnrolledContestDetail` into a single query that returns both access level and detail, or cache the assignment row between calls. The exam session query should also be deduplicated.

---

### PERF-2: [LOW] SSE connection tracking FIFO eviction is already improved from previous reviews

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:39-75`

Verified that the two-phase eviction (stale cleanup + FIFO by insertion order) has replaced the previous O(n) oldest-entry scan. The `userConnectionCounts` Map provides O(1) per-user count lookup. No further optimization needed at current scale.

---

### PERF-3: [LOW] Public problem detail page runs 4+ parallel query batches

**File:** `src/app/(public)/practice/problems/[id]/page.tsx:225-252`

The page correctly uses `Promise.all` for independent queries after the problem lookup, which is good. However, the first query batch (lines 125-133) includes `auth()`, `getLocale()`, and multiple `getTranslations()` calls that are independent of the problem data but block the problem query (line 136). These could be parallelized with the initial problem lookup.

**Fix:** Move the problem query and translation queries into a single `Promise.all` batch, then do the access check and second query batch afterward.

---

### PERF-4: [LOW] `getEnrolledContestDetail` calls `resolveCapabilities` redundantly

**File:** `src/lib/assignments/public-contests.ts:277-278`

`getEnrolledContestDetail` calls `resolveCapabilities(role)` on line 277, but `getUserContestAccess` already called `resolveCapabilities(role)` on line 209 of the same file. When both functions are called in sequence (as in the contest detail page), the capabilities are resolved twice. The `resolveCapabilities` function has a cache, but the cache still incurs a function call + map lookup overhead.

**Fix:** Pass the resolved capabilities set from `getUserContestAccess` to `getEnrolledContestDetail`, or return access info that includes the capabilities.

---

## No High-severity performance findings

The codebase uses `Promise.all` appropriately in most server components. The main area for improvement is reducing redundant queries in the enrolled contest detail flow.
