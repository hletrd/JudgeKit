# Cycle 14 Review Remediation Plan

**Date:** 2026-04-19
**Source:** `.context/reviews/cycle-14-comprehensive-review.md` and `.context/reviews/_aggregate.md`
**Status:** In Progress (committing fixes)

---

## MEDIUM Priority

### M1: Remove redundant `roleName === "super_admin"` shortcut in `resolveCapabilities`
- **File**: `src/lib/capabilities/cache.ts:103-106`
- **Status**: TODO
- **Plan**:
  1. Remove lines 103-106 (the `if (roleName === "super_admin")` block)
  2. Add a code comment explaining why the level-based check at line 99 is sufficient (the `loadRolesFromDb` built-in fallback and the super_admin safety override in that function already guarantee ALL_CAPABILITIES for "super_admin")
  3. Verify no other code relies on this specific shortcut (grep for comments referencing it)
- **Exit criterion**: No `roleName === "super_admin"` string comparison exists in `resolveCapabilities`. The function only uses level-based checks.

### M2: Replace `isAdmin()` sync calls with async capability check in assignment route
- **File**: `src/app/api/v1/groups/[id]/assignments/[assignmentId]/route.ts:109,181,223`
- **Status**: TODO
- **Plan**:
  1. Import `resolveCapabilities` (already imported in this file or add it)
  2. Replace `isAdmin(user.role)` at line 109 with `caps.has("content.manage")` where `caps` is obtained from `resolveCapabilities(user.role)` — but note: this is inside a transaction callback. Need to resolve caps before the transaction to avoid async inside sync-looking transaction code.
  3. Alternative: Import `isAdminAsync` and use `await isAdminAsync(user.role)` before the transaction, store the result in a boolean variable, and use the variable inside the transaction.
  4. Replace all 3 occurrences consistently.
  5. Verify the route tests still pass.
- **Exit criterion**: No `isAdmin(user.role)` sync calls in the assignment route. Custom admin-level roles can override problem locks.

### M3: Remove unused `canManageRole` sync function
- **File**: `src/lib/security/constants.ts:73-81`
- **Status**: TODO
- **Plan**:
  1. Verify zero callers with grep (confirmed: only the definition and the JSDoc comment reference it)
  2. Remove the function and its JSDoc comment (lines 70-81)
  3. Run tests to ensure nothing breaks
- **Exit criterion**: No `canManageRole` sync function exported from constants.ts. Only `canManageRoleAsync` remains.

### M4: Add limit to anti-cheat heartbeat gap detection query
- **File**: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:185-193`
- **Status**: TODO
- **Plan**:
  1. Add `.limit(5000)` to the heartbeat query at line 193
  2. Add a code comment explaining the limit (prevents memory spikes for very long contests)
  3. The gap detection algorithm still works correctly with a limit — it only detects gaps in the most recent 5000 heartbeats, which covers ~83 hours at 60s intervals
- **Exit criterion**: Heartbeat gap detection query has a reasonable LIMIT clause.

---

## LOW Priority

### L1: Replace `console.error` with structured logger in error boundaries
- **Files**: `src/app/(dashboard)/dashboard/admin/error.tsx:17`, `submissions/error.tsx:17`, `problems/error.tsx:17`, `groups/error.tsx:17`
- **Status**: TODO
- **Plan**:
  1. Check if the structured logger works in client components (these are "use client" error boundaries)
  2. If not, use `console.error` but wrap in a more descriptive message: `console.error("[error-boundary] Uncaught error:", error)`
  3. If the logger works client-side, replace with `logger.error({ err: error }, "Uncaught error in error boundary")`
- **Exit criterion**: Error boundaries have more descriptive error logging.

### L2: Add debug logging to `use-source-draft` localStorage catch blocks
- **File**: `src/hooks/use-source-draft.ts:63,70`
- **Status**: TODO
- **Plan**:
  1. Replace `catch {}` at line 63 with `catch { /* localStorage unavailable (private browsing, quota) */ }`
  2. Replace `catch {}` at line 70 with same pattern
  3. These are client-side hooks where logging is not critical — a comment is sufficient
- **Exit criterion**: No bare `catch {}` blocks in use-source-draft.ts.

### L3: Shell command validator blocks redirect operators (intentional — documentation only)
- **File**: `src/lib/compiler/execute.ts:156`
- **Status**: DEFERRED
- **Reason**: The denylist is intentionally strict and kept in lock-step with the Rust judge worker. Changing it could create a divergence. Admins can use `&&` for chaining (which is allowed). I/O redirects are a security concern in Docker commands even with sandboxing.
- **Exit criterion**: Re-open if a legitimate compile command requires I/O redirects and cannot be expressed with the current allowed set.

### L4: Add comment to community votes transaction about isolation semantics
- **File**: `src/app/api/v1/community/votes/route.ts:110-121`
- **Status**: TODO
- **Plan**:
  1. Add a brief comment above the summary query explaining that READ COMMITTED isolation means the returned score includes concurrent votes from other transactions.
- **Exit criterion**: Score summary query has an isolation semantics comment.

---

## Deferred Items

| Finding | Severity | Reason | Exit Criterion |
|---------|----------|--------|----------------|
| L3 (shell command validator) | LOW | Intentionally strict denylist; kept in lock-step with Rust worker | Re-open if legitimate compile command needs redirects |
