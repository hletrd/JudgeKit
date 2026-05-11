# Cycle 9 Review Remediation Plan

**Date:** 2026-05-11
**Source:** `.context/reviews/_aggregate.md`
**New findings:** 5 (all LOW)
**Status:** Completed

---

## Task 1: Fix SIGINT Handler to Allow Natural Exit [C9-AGG-1]

**Priority:** LOW
**Confidence:** High
**File:** `src/lib/audit/node-shutdown.ts:49`

**What to do:**
Remove the `processLike.exit?.(130)` call from the SIGINT handler's `.finally()` block, matching the SIGTERM handler pattern from cycle 8. The natural Node.js exit code for SIGINT is already 130.

**Verification:**
- `tsc --noEmit` passes
- Node shutdown tests pass

**Status:** DONE — commit `0529bf32`

---

## Task 2: Fix Malformed JSON Success Response Handling [C9-AGG-3]

**Priority:** LOW
**Confidence:** High
**Files:**
- `src/app/(auth)/verify-email/page.tsx:38-50`
- `src/app/(auth)/forgot-password/forgot-password-form.tsx:34-55`
- `src/app/(auth)/reset-password/reset-password-form.tsx:52-73`
- `src/app/(public)/problems/create/create-problem-form.tsx:343-356`

**What to do:**
Add an explicit parse-success check alongside `res.ok` in all four components. Change the pattern from:
```ts
const data = await res.json().catch(() => ({ error: "unknown" }));
if (!res.ok) { /* error */ }
// success
```
to:
```ts
let data: unknown;
let parseOk = false;
try {
  data = await res.json();
  parseOk = true;
} catch {
  data = { error: "unknown" };
}
if (!res.ok || !parseOk) { /* error */ }
// success
```

**Verification:**
- `tsc --noEmit` passes
- Component tests pass
- `npm run test:unit` passes

**Status:** DONE — commit `c9773510`

---

## Task 3: Fix countdown-timer AbortController Leak [C9-AGG-2]

**Priority:** LOW
**Confidence:** High
**File:** `src/components/exam/countdown-timer.tsx:186`

**What to do:**
Store the cleanup function returned by `syncTime()` in a ref, and abort any in-flight sync before starting a new one. Add a `syncCleanupRef` that stores and calls the cleanup from the previous `syncTime()` invocation.

**Verification:**
- `tsc --noEmit` passes
- Component tests pass

**Status:** DONE — commit `7ee63be5`

---

## Deferred Items

### DEFER-C9-1: apiFetch Fallback Timer Leak [C9-AGG-4]
- **Severity:** LOW
- **File:** `src/lib/api/client.ts:97-98`
- **Reason:** Old-browser-only (Safari < 16.4, Chrome < 103). Modern browsers use `AbortSignal.timeout` which has no leak. Impact is minimal.
- **Exit criterion:** When browser support drops below 1% for browsers without `AbortSignal.timeout`.

### All Prior Deferred Items
All deferred items from cycles 1-8 remain unchanged. See `_aggregate.md` for full registry.

---

## Progress Tracking

| Task | Status | Commit |
|------|--------|--------|
| Task 1: SIGINT natural exit | DONE | `0529bf32` |
| Task 2: Malformed JSON success | DONE | `c9773510` |
| Task 3: countdown-timer leak | DONE | `7ee63be5` |

---

## Gate Status

- [x] eslint — 0 errors, 0 warnings
- [x] next build — success
- [x] vitest — 317 files, 2399 tests passed
