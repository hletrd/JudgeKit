# Cycle 44 Review Remediation Plan

**Date:** 2026-05-10
**Cycle:** 44/100
**Source:** `_aggregate.md` (C44-1, C44-2)
**Status:** COMPLETED — all fixes implemented and committed, all gates pass

---

## Action Items

### C44-FIX-1: Add `stopSseCleanupTimer()` for test teardown

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:122-145`
**Severity:** LOW
**Confidence:** HIGH
**Status:** COMPLETED — committed as `4ce6d7b6`

**Problem:**
The `globalThis.__sseCleanupTimer` (a `setInterval` for evicting stale SSE connection tracking entries) is created at module load time with an atomic guard (`globalThis.__sseCleanupInitialized`), but there is no corresponding exported `stopSseCleanupTimer()` function. This is the exact same pattern fixed for the audit flush timer in cycle 43 (C43-1) and the rate-limit eviction timer in cycle 34.

**Fix:**
Add exported `stopSseCleanupTimer()` function near the cleanup timer registration:
```typescript
export function stopSseCleanupTimer() {
  if (globalThis.__sseCleanupTimer) {
    clearInterval(globalThis.__sseCleanupTimer);
    globalThis.__sseCleanupTimer = undefined;
    globalThis.__sseCleanupInitialized = false;
  }
}
```

**Verification:**
- eslint passes
- tsc --noEmit passes
- Unit tests pass
- No open handles in test output

---

### C44-FIX-2: Replace `formData.get("password") as string | null` with safe extraction

**Files:**
- `src/app/api/v1/admin/migrate/import/route.ts:48`
- `src/app/api/v1/admin/restore/route.ts:40`
**Severity:** LOW
**Confidence:** MEDIUM
**Status:** COMPLETED — committed as `da1628ff`

**Problem:**
These are additional instances of DEFER-36 (`formData.get()` cast assertions) that were not addressed in cycle 40. Cycle 40 fixed `login-form.tsx` and `change-password-form.tsx`, but these admin routes retain the unsafe cast pattern.

**Fix:**
Replace:
```typescript
password = formData.get("password") as string | null;
```
With:
```typescript
password = formData.get("password")?.toString() ?? null;
```

Or use the same pattern as cycle 40:
```typescript
const passwordField = formData.get("password");
const password = typeof passwordField === "string" ? passwordField : null;
```

The existing `typeof password !== "string"` guards on the next line already protect against type mismatches, so this fix is for consistency and to eliminate the unsafe cast pattern.

**Verification:**
- eslint passes
- tsc --noEmit passes
- Unit tests pass

---

## Deferred Findings (carried forward)

All deferred items from previous cycles remain unchanged. See `_aggregate-cycle-40.md` for the full list.

| Finding | Severity | Reason | Exit Criterion |
|---------|----------|--------|----------------|
| C-1 (Test/Seed localhost spoofable) | CRITICAL | Infrastructure fix required (nginx XFF stripping) | Nginx config updated |
| DEFER-22 (.json() before .ok) | MEDIUM | Broad refactor across 60+ instances | All instances use apiFetchJson |
| DEFER-28 (as { error?: string }) | MEDIUM | Broad refactor across 22+ instances | All unsafe assertions removed |
| DEFER-46 (error.message control flow) | MEDIUM | Broad refactor across 15+ API catch blocks | All use typed error codes |
| DEFER-47 (Import route unsafe cast) | MEDIUM | Zod validation not yet built | Import uses Zod schema validation |
| DEFER-48 (CountdownTimer client time) | LOW | Minor UX issue | Timer uses getDbNowMs on init |
| DEFER-49 (SSE O(n) scan) | LOW | Performance optimization | Uses Map or heap for eviction |

---

## Commits (to be created)

1. `fix(sse): export stopSseCleanupTimer for test teardown`
2. `fix(admin): replace unsafe formData.get() as string casts with safe extraction`
