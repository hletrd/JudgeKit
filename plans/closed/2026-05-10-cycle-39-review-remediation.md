# Cycle 39 Review Remediation Plan

**Date:** 2026-05-10
**Based on:** `.context/reviews/_aggregate.md` (cycle 39)
**HEAD:** 5a6239b2

---

## Active Tasks

### Task 1: Fix streamDatabaseExport missing pre-aborted signal check

**Severity:** LOW
**File:** `src/lib/db/export.ts:80-81`
**Finding:** AGG-1

**Description:**
The `streamDatabaseExport` function adds an abort listener with `{ once: true }` but does not check if the signal is already aborted before entering the streaming loop. If called with a pre-aborted signal, the listener never fires and the export continues indefinitely.

**Implementation Steps:**
1. Add an early check for `options.signal?.aborted` at the start of the `start` callback.
2. If already aborted, call `controller.close()` and return immediately.
3. This matches the pattern already used in `streamBackupWithFiles` (export-with-files.ts lines 138, 166, 193).

**Expected Code Change:**
```ts
// Before:
async start(controller) {
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    await db.transaction(async (tx) => {

// After:
async start(controller) {
  if (options.signal?.aborted) {
    controller.close();
    return;
  }
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    await db.transaction(async (tx) => {
```

**Verification:**
- [ ] Code compiles (`npx tsc --noEmit`) — 0 errors
- [ ] ESLint passes (`npx eslint src/lib/db/export.ts`) — 0 errors
- [ ] All gates pass — eslint, tsc, next build, vitest run, vitest component tests

**Status:** ALREADY FIXED in current code

The `streamDatabaseExport` function already includes the pre-aborted signal check at lines 81-84:

```ts
async start(controller) {
  if (options.signal?.aborted) {
    controller.close();
    return;
  }
  options.signal?.addEventListener("abort", abort, { once: true });
```

Verification:
- [x] Code inspection confirms pre-aborted check exists at lines 81-84
- [x] Code compiles (`npx tsc --noEmit`) — 0 errors
- [x] ESLint passes (`npx eslint src/lib/db/export.ts`) — 0 errors
- [x] All gates pass — eslint, tsc, next build, vitest run (317 files/2391 tests), vitest component tests (68 files/208 tests)

---

## Actions Taken This Cycle

1. **Verified all prior cycle fixes:**
   - Cycle 38 (1 finding): ALL FIXED — anti-cheat heartbeat stall resolved
   - Cycle 37 (4 findings): ALL FIXED
   - Cycle 36 (6 findings): ALL FIXED
   - Cycle 35 (4 findings): ALL FIXED
   - Cycle 34 (3 findings): ALL FIXED
   - Cycle 33 (3 findings): ALL FIXED
   - Cycle 32 (2 findings): ALL FIXED

2. **Ran quality gates:** All pass
   - `npx eslint .` — 0 errors
   - `npx tsc --noEmit` — 0 errors
   - `npx vitest run` — 317 files, 2391 tests (all pass)
   - `npx vitest run --config vitest.config.component.ts` — 68 files, 208 tests (all pass)
   - `npx next build` — successful

---

## Carry-Forward Deferred Items (unchanged)

### CRITICAL (requires architecture/product decision)
- **C-1**: Test/Seed localhost check spoofable — requires architecture review
- **C-2**: Accepted solutions endpoint unauthenticated — requires product decision
- **C-3**: File DELETE CSRF ordering — requires API refactor

### HIGH
- **H-1**: SSE result visibility bypass — requires SSE sanitization refactor

### MEDIUM
- **DEFER-C30-4**: `.json()` before `.ok` in non-critical components (30+ files) — large refactor
- **DEFER-C30-5**: Raw API error strings without i18n (ongoing incremental)
- **DEFER-C30-6**: `as { error?: string }` unsafe type assertions (15 instances)
- **C29 AGG-10**: Admin routes bypass createApiHandler (partially fixed, 15 routes remain)
- **C29 AGG-12**: Recruiting validate endpoint token brute-force (mitigated by rate limit + format validation)

### LOW
- **DEFER-27**: Missing AbortController on polling fetches
- **DEFER-34**: Hardcoded English fallback strings
- **DEFER-35**: Hardcoded English strings in editor title attributes
- **DEFER-36**: `formData.get()` cast assertions without validation
- **C25-6**: Client-side console.error (remaining instances)
- **C25-7**: WeakMap complexity in api-rate-limit.ts
- **C29 AGG-13**: files/[id] GET selects storedName
- **C29 AGG-14**: Admin settings exposes DB host/port
- **C29 AGG-15**: Missing error boundaries
- **C29 AGG-17**: Hardcoded English in throw new Error (permissions.ts)
- **C29 AGG-18**: Hardcoded English fallback strings in code-editor.tsx
- **C29 AGG-19**: formData.get() cast assertions without validation

---

## Exit Criteria for Deferred Items

See individual cycle plans for specific exit criteria. General rules:
- **CRITICAL/HIGH**: Require explicit architecture/product decision before deferral expiry
- **MEDIUM**: Should be addressed in dedicated refactoring cycles
- **LOW**: Address opportunistically during feature work or when file is touched
