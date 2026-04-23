# Code Review — RPF Cycle 47

**Date:** 2026-04-23
**Reviewer:** code-reviewer
**Base commit:** f8ba7334

## Inventory of Files Reviewed

- `src/lib/realtime/realtime-coordination.ts` — Verified cycle 46 fix (getDbNowUncached)
- `src/app/(dashboard)/dashboard/contests/page.tsx` — Verified cycle 46 fix (null guards)
- `src/lib/assignments/contest-scoring.ts` — Verified cycle 46 fix (deterministic tie-breaking)
- `src/app/(dashboard)/dashboard/_components/candidate-dashboard.tsx` — Verified cycle 46 fix (null guards)
- `src/app/(public)/practice/page.tsx` — Reviewed remaining pattern
- `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx` — Zip import non-null assertion
- `src/lib/assignments/contest-analytics.ts` — Student progression uses raw scores without late penalty
- `src/lib/assignments/leaderboard.ts` — Date.now() for freeze comparison
- `src/lib/security/api-rate-limit.ts` — checkServerActionRateLimit Date.now() in DB transaction
- `src/lib/assignments/submissions.ts` — Verified cycle 45 fix

## Previously Fixed Items (Verified)

- `realtime-coordination.ts` uses `getDbNowUncached()` for SSE slot and heartbeat: PASS
- Contests page uses `statusMap.get(c.id) ?? "closed"` null guards: PASS
- `contest-scoring.ts` IOI sort uses deterministic tie-breaking: PASS
- Candidate dashboard uses `?? []` null guard: PASS
- `validateAssignmentSubmission` uses `getDbNowUncached()`: PASS

## New Findings

### CR-1: `checkServerActionRateLimit` uses `Date.now()` inside a DB transaction — clock-skew risk [MEDIUM/MEDIUM]

**File:** `src/lib/security/api-rate-limit.ts:215`

**Description:** The `checkServerActionRateLimit` function captures `const now = Date.now()` at line 215 and uses it inside an `execTransaction` to compare against DB-stored `windowStartedAt` (line 234). This is the same clock-skew class that was fixed in `atomicConsumeRateLimit` (noted as prior AGG-2 in cycle 45 aggregate, deferred for that function due to hot-path concerns) and `realtime-coordination.ts` (fixed in cycle 46).

Unlike `atomicConsumeRateLimit` (which is called on every API request and runs on the hot path), `checkServerActionRateLimit` is called for server actions with much lower frequency (role edits, group management). The DB round-trip cost of `getDbNowUncached()` is acceptable here.

**Concrete failure scenario:** App server clock is 5 seconds behind DB. A user performs a server action at DB time 10:00:55. Their previous `windowStartedAt` was set at DB time 10:00:00. The check `existing.windowStartedAt + windowMs <= now` becomes `10:00:00 + 60000 <= (10:00:50 * 1000)` which evaluates as `60000 <= 50000` — false. The old window is not expired yet (correct). But if the app is ahead by 5 seconds: `60000 <= 65000` — true, the window is expired prematurely, and the user's rate-limit counter resets, allowing more requests than configured.

**Fix:** Use `getDbNowUncached()` at the start of the transaction:
```typescript
const now = (await getDbNowUncached()).getTime();
```

**Confidence:** Medium

---

### CR-2: Zip import uses `fileMap.get(key)!` non-null assertion — technically safe but inconsistent [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:196`

**Description:** `const pair = fileMap.get(key)!;` — the key comes from iterating `fileMap.keys()`, so the assertion is technically safe. However, the codebase has systematically replaced `Map.get()!` patterns with null-safe alternatives across cycles 43-46. This is the only remaining instance.

**Fix:** Use null guard: `const pair = fileMap.get(key); if (!pair) continue;`

**Confidence:** Low

---

### CR-3: Practice page `resolvedSearchParams?.sort as SortOption` — unsafe type assertion [LOW/LOW]

**File:** `src/app/(public)/practice/page.tsx:128-129`

**Description:** The code `SORT_VALUES.includes(resolvedSearchParams?.sort as SortOption) ? (resolvedSearchParams?.sort as SortOption) : "number_asc"` casts `resolvedSearchParams?.sort` (which is `string | undefined`) as `SortOption` before the `includes` check validates it. The `as SortOption` assertion tells TypeScript the value is a `SortOption` when it may not be. The `includes` check does validate the runtime value, so this is safe in practice, but the type assertion is misleading.

**Fix:** Use a type-safe approach:
```typescript
const sortValue = resolvedSearchParams?.sort;
const currentSort: SortOption = SORT_VALUES.includes(sortValue as SortOption)
  ? (sortValue as SortOption)
  : "number_asc";
```
Or better, use a type guard. This is a cosmetic inconsistency, not a bug.

**Confidence:** Low
