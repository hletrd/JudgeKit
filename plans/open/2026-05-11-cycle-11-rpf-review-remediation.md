# Cycle 11 Review Remediation Plan

**Date:** 2026-05-11
**Source:** `.context/reviews/_aggregate.md` (cycle 11)
**New findings:** 4 (all LOW)
**Status:** In Progress

---

## Task 1: Remove dead `staggeredTimerIdsRef` from CountdownTimer [C11-1]

**Priority:** LOW
**Confidence:** High
**File:** `src/components/exam/countdown-timer.tsx:50, 214-215`

**What to do:**
Remove `staggeredTimerIdsRef` declaration (line 50) and its cleanup in the timer effect (lines 214-215).

**Verification:**
- `tsc --noEmit` passes
- Component tests pass
- `npm run test:unit` passes

**Status:** PENDING

---

## Task 2: Remove redundant `as string` cast in SSE handler [C11-2]

**Priority:** LOW
**Confidence:** High
**File:** `src/hooks/use-submission-polling.ts:139`

**What to do:**
Change `JSON.parse(event.data as string)` to `JSON.parse(event.data)`.

**Verification:**
- `tsc --noEmit` passes
- Tests pass

**Status:** PENDING

---

## Task 3: Remove unsafe `as` casts in normalizeSubmission [C11-3]

**Priority:** LOW
**Confidence:** Medium
**File:** `src/hooks/use-submission-polling.ts:48-49, 70-71, 139`

**What to do:**
Remove `as Record<string, unknown>` casts from lines 48-49, 70-71, and 139. The runtime guards already provide safety.

Line 48: `const record = result as Record<string, unknown>;` → `const record = result;` (but result is already `unknown`)
Line 49: `const testCase = record.testCase as Record<string, unknown> | null;` → use runtime check
Line 70: `const user = data.user as Record<string, unknown> | null;` → use runtime check
Line 71: `const problem = data.problem as Record<string, unknown> | null;` → use runtime check
Line 139: `const data = JSON.parse(event.data as string) as Record<string, unknown>;` → remove both `as` casts

**Verification:**
- `tsc --noEmit` passes
- Tests pass

**Status:** PENDING

---

## Task 4: Use DB time for `lastAuditEventWriteFailureAt` [C11-4]

**Priority:** LOW
**Confidence:** High
**File:** `src/lib/audit/events.ts:206`

**What to do:**
Pass `dbNow` (from `getDbNowUncached()`) into `flushAuditBuffer` and use it instead of `new Date().toISOString()`.

**Current code:**
```ts
lastAuditEventWriteFailureAt = new Date().toISOString();
```

**Fix:**
Accept a `dbNow?: Date` parameter in `flushAuditBuffer` and use `dbNow?.toISOString() ?? new Date().toISOString()` as fallback.

**Verification:**
- `tsc --noEmit` passes
- Tests pass

**Status:** PENDING

---

## Deferred Items

All deferred items from previous cycles remain unchanged. See `_aggregate.md` for full registry.

---

## Progress Tracking

| Task | Status | Commit |
|------|--------|--------|
| Task 1: Remove dead staggeredTimerIdsRef | PENDING | |
| Task 2: Remove redundant as string | PENDING | |
| Task 3: Remove unsafe as casts | PENDING | |
| Task 4: Use DB time for audit failure timestamp | PENDING | |

---

## Gate Status

- [x] eslint — 0 errors, 0 warnings
- [x] next build — success
- [x] vitest — 317 files, 2399 tests passed
