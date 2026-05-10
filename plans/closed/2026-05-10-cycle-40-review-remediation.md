# Cycle 40 Review Remediation Plan

**Date:** 2026-05-10
**Based on:** `.context/reviews/_aggregate.md` (cycle 40)
**HEAD:** 701ee64d

---

## Active Tasks

### Task 1: Fix `formData.get()` cast assertions in auth forms (DEFER-36)

**Severity:** LOW
**Files:**
- `src/app/(auth)/login/login-form.tsx:27-28`
- `src/app/change-password/change-password-form.tsx:29-31`
**Finding:** AGG-1 (DEFER-36, re-validated this cycle)

**Description:**
The login and change-password forms use the unsafe `as string` cast pattern on `formData.get()` results:
```ts
const username = formData.get("username") as string;
const password = formData.get("password") as string;
```

The signup form already uses the safe pattern:
```ts
const username = String(formData.get("username") ?? "");
```

**Implementation Steps:**
1. Update `login-form.tsx` lines 27-28 to use `String(formData.get("...") ?? "")`
2. Update `change-password-form.tsx` lines 29-31 to use `String(formData.get("...") ?? "")`
3. Verify both forms still compile and function correctly

**Expected Code Changes:**
```ts
// login-form.tsx:27-28
// Before:
const username = formData.get("username") as string;
const password = formData.get("password") as string;
// After:
const username = String(formData.get("username") ?? "");
const password = String(formData.get("password") ?? "");
```

```ts
// change-password-form.tsx:29-31
// Before:
const currentPassword = formData.get("currentPassword") as string;
const newPassword = formData.get("newPassword") as string;
const confirmPassword = formData.get("confirmPassword") as string;
// After:
const currentPassword = String(formData.get("currentPassword") ?? "");
const newPassword = String(formData.get("newPassword") ?? "");
const confirmPassword = String(formData.get("confirmPassword") ?? "");
```

**Verification:**
- [ ] Code compiles (`npx tsc --noEmit`) — 0 errors
- [ ] ESLint passes (`npx eslint src/app/(auth)/login/login-form.tsx src/app/change-password/change-password-form.tsx`) — 0 errors
- [ ] All gates pass — eslint, tsc, next build, vitest run, vitest component tests

**Status:** DONE

**Verification:**
- [x] Code compiles (`npx tsc --noEmit`) — 0 errors
- [x] ESLint passes (`npx eslint "src/app/(auth)/login/login-form.tsx" "src/app/change-password/change-password-form.tsx"`) — 0 errors
- [x] Unit/integration tests pass (`npx vitest run`) — 317 files, 2391 tests (all pass)
- [x] Component tests pass (`npx vitest run --config vitest.config.component.ts`) — 68 files, 208 tests (all pass)
- [x] Next build passes (`npx next build`)

---

## Actions Taken This Cycle

1. **Archived completed plans:**
   - `plans/open/2026-05-10-cycle-38-review-remediation.md` -> `plans/closed/`
   - `plans/open/2026-05-10-cycle-39-review-remediation.md` -> `plans/closed/`

2. **Verified all prior cycle fixes:**
   - Cycle 39 (1 finding): ALL FIXED — pre-aborted signal check in export.ts
   - Cycle 38 (1 finding): ALL FIXED — anti-cheat heartbeat stall resolved
   - Cycles 32-37: ALL FIXED (verified in prior aggregates)

3. **Ran quality gates:** All pass
   - `npx eslint .` — 0 errors
   - `npx tsc --noEmit` — 0 errors
   - `npx vitest run` — 317 files, 2391 tests (all pass)
   - `npx vitest run --config vitest.config.component.ts` — 68 files, 208 tests (all pass)

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
- **C25-6**: Client-side console.error (remaining instances)
- **C25-7**: WeakMap complexity in api-rate-limit.ts
- **C29 AGG-13**: files/[id] GET selects storedName
- **C29 AGG-14**: Admin settings exposes DB host/port
- **C29 AGG-15**: Missing error boundaries
- **C29 AGG-17**: Hardcoded English in throw new Error (permissions.ts)
- **C29 AGG-18**: Hardcoded English fallback strings in code-editor.tsx

---

## Exit Criteria for Deferred Items

See individual cycle plans for specific exit criteria. General rules:
- **CRITICAL/HIGH**: Require explicit architecture/product decision before deferral expiry
- **MEDIUM**: Should be addressed in dedicated refactoring cycles
- **LOW**: Address opportunistically during feature work or when file is touched
