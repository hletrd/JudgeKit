# Performance Review — Cycle 2

**Reviewer:** perf-reviewer
**Date:** 2026-04-28
**Scope:** Verification of cycle 1 fixes + new performance review

---

## Cycle 1 Fix Verification

No performance fixes were applied in cycle 1 (all PERF findings were MEDIUM/LOW and deferred). The redundant `getExamSession` fallback was removed as part of AGG-9, which is a minor performance improvement.

---

## New Findings

### PERF-C2-1: [LOW] Contest listing page runs `getContestsForUser` and `getPublicContests` sequentially

**File:** `src/app/(public)/contests/page.tsx:99-108`
**Confidence:** LOW

```tsx
const now = await getDbNow();
const myContestsRaw = isAuthenticated && session?.user
  ? await getContestsForUser(session.user.id, session.user.role)
  : [];
const myContests = myContestsRaw.map(...);

const contests = await getPublicContests();
```

`getContestsForUser` and `getPublicContests` are independent queries (one gets the user's enrolled contests, the other gets all public contests). They could be run in parallel with `Promise.all` since they don't depend on each other.

**Failure scenario:** For authenticated users, the page waits for `getContestsForUser` to complete before starting `getPublicContests`, adding an unnecessary DB roundtrip latency.

**Fix:** Use `Promise.all([getContestsForUser(...), getPublicContests()])` after `getDbNow()`.

---

### PERF-C2-2: [LOW] `getEnrolledContestDetail` calls `getDbNow()` at line 315 even when the caller already has `now`

**File:** `src/lib/assignments/public-contests.ts:315`
**Confidence:** LOW

The contest detail page calls `getDbNow()` at line 135, then `getEnrolledContestDetail` calls it again internally. This is an extra DB query.

**Fix:** Accept `now` as an optional parameter in `getEnrolledContestDetail`, defaulting to `getDbNow()`.

---

## Summary

No HIGH or MEDIUM performance findings this cycle. The remaining issues are LOW-severity query optimizations.
