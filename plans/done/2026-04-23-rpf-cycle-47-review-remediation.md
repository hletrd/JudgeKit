# Cycle 47 Review Remediation Plan

**Date:** 2026-04-23
**Cycle:** 47/100
**Base commit:** f8ba7334

## Findings to Address

### Lane 1: Replace `Date.now()` with `getDbNowUncached()` in `checkServerActionRateLimit` [MEDIUM/MEDIUM]

**Source:** AGG-1 (9-agent consensus: CR-1, SEC-1, ARCH-1, CRI-1, V-1, DBG-1, TE-1, TR-1, DOC-1)

**File:**
- `src/lib/security/api-rate-limit.ts:215`

**Changes:**
1. Import `getDbNowUncached` from `@/lib/db-time` (already imported for other functions)
2. In `checkServerActionRateLimit`: replace `const now = Date.now();` with `const now = (await getDbNowUncached()).getTime();` inside the `execTransaction` callback
3. Add a comment explaining the clock-skew rationale (consistent with `realtime-coordination.ts`)
4. Verify existing tests still pass (the function is already async)

**Exit criteria:** `checkServerActionRateLimit` uses DB time for all comparisons against DB-stored `rateLimits` columns.

---

### Lane 2: Replace `fileMap.get(key)!` in zip import with null guard [LOW/LOW]

**Source:** AGG-2 (2-agent: CR-2, TE-2)

**File:**
- `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:196`

**Changes:**
1. Line 196: Replace `const pair = fileMap.get(key)!;` with `const pair = fileMap.get(key); if (!pair) continue;`

**Exit criteria:** No `Map.get()!` patterns remain in the codebase.

---

## Deferred Items (from this cycle's reviews)

| Finding | File+Line | Severity/Confidence | Reason for Deferral | Exit Criterion |
|---------|-----------|-------------------|--------------------|---------------|
| AGG-3: Practice page unsafe type assertion | practice/page.tsx:128-129 | LOW/LOW | Type-safe by runtime validation; cosmetic | Module refactoring cycle |
| AGG-4: Missing clock-skew comment (superseded by Lane 1 fix) | api-rate-limit.ts:215 | LOW/LOW | Superseded by Lane 1 fix | AGG-1 resolved |

All prior deferred items from cycles 37-46 remain deferred as documented in `_aggregate.md`.

## Progress

- [x] Lane 1: checkServerActionRateLimit clock-skew fix (commit cbe83435)
- [x] Lane 2: Zip import fileMap.get()! null guard (commit 4a497b7d)
