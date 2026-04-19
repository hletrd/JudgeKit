# Cycle 13 Review Remediation Plan

**Date:** 2026-04-19
**Source:** `.context/reviews/cycle-13-comprehensive-review.md` and `.context/reviews/_aggregate.md`
**Status:** Open

---

## MEDIUM Priority

### M1: Fix community votes race condition with transaction
- **File**: `src/app/api/v1/community/votes/route.ts:78-107`
- **Status**: TODO
- **Plan**:
  1. Wrap the read-check-write logic in `db.transaction()`
  2. Use `SELECT ... FOR UPDATE` (or Drizzle equivalent) to lock the existing vote row during the transaction
  3. Move the delete/update/insert branch logic inside the transaction
  4. Update the score summary query to run within the same transaction for consistent read
  5. Verify existing tests still pass and add a test for concurrent vote toggling
- **Exit criterion**: No TOCTOU race in community votes route; concurrent votes from the same user produce consistent results.

### M2: Remove or harden deprecated `validateRoleChange` sync function
- **File**: `src/lib/users/core.ts:83-101`
- **Status**: TODO
- **Plan**:
  1. Verify no callers import `validateRoleChange` (only `validateRoleChangeAsync` should be used)
  2. Remove the deprecated function entirely, OR
  3. If any callers exist, migrate them to `validateRoleChangeAsync` first, then remove
  4. As a safety net, add a runtime throw in the deprecated function directing to `validateRoleChangeAsync`
  5. Update tests accordingly
- **Exit criterion**: No exported `validateRoleChange` function with hardcoded `=== "super_admin"` check exists in the codebase.

---

## LOW Priority

### L1: Refactor analytics page raw SQL to use Drizzle subquery
- **File**: `src/app/(dashboard)/dashboard/groups/[id]/analytics/page.tsx:71`
- **Status**: TODO
- **Plan**:
  1. Replace `sql`ANY (${subquery})`` with Drizzle's `inArray` subquery pattern
  2. Replace `sql`... NOT IN ('pending', 'queued', 'judging')`` with a Drizzle `notInArray` using status values derived from the schema
  3. Verify the query produces the same results
- **Exit criterion**: No raw `sql` template with hardcoded status strings in analytics page; uses Drizzle query builder exclusively.

### L2: Document anti-cheat LRU cache single-instance limitation
- **File**: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:16`
- **Status**: DEFERRED
- **Reason**: The `getUnsupportedRealtimeGuard` at line 37 already blocks the endpoint in multi-instance deployments without shared coordination. The LRU cache is only used when running single-instance (which is the documented deployment model). No production impact.
- **Exit criterion**: Re-open if multi-instance deployment without shared coordination becomes a supported configuration for anti-cheat routes.

### L3: Replace hardcoded `role?.name === "super_admin"` with level check in role editor dialog
- **File**: `src/app/(dashboard)/dashboard/admin/roles/role-editor-dialog.tsx:83,114`
- **Status**: TODO
- **Plan**:
  1. The `RoleData` interface already includes `level: number`
  2. Define `SUPER_ADMIN_LEVEL` as a constant (matching `DEFAULT_ROLE_LEVELS.super_admin = 4`) accessible to the client component
  3. Replace `role?.name === "super_admin"` at line 83 with `role && role.level >= SUPER_ADMIN_LEVEL`
  4. Replace `role?.name === "super_admin"` at line 114 with `role && role.level >= SUPER_ADMIN_LEVEL`
  5. This ensures custom super_admin-equivalent roles also have their capabilities locked in the UI
- **Exit criterion**: Role editor dialog uses level-based check instead of hardcoded role name.

### L4: Replace hardcoded `userRole === "super_admin"` with level check in user actions
- **File**: `src/app/(dashboard)/dashboard/admin/users/user-actions.tsx:80`
- **Status**: TODO
- **Plan**:
  1. Add a `userLevel` prop to the `UserActions` component
  2. Pass the user's role level from the parent component
  3. Replace `userRole === "super_admin"` with `userLevel >= SUPER_ADMIN_LEVEL`
  4. Update the parent component to pass the level
- **Exit criterion**: User actions component uses level-based check instead of hardcoded role name.

### L5: Add warning for elevated roles in bulk create dialog
- **File**: `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:77-79`
- **Status**: DEFERRED
- **Reason**: The bulk create API route validates role assignments server-side. The client-side normalization merely maps CSV input to known role names. Adding a warning would be a UX enhancement but the server already protects against unauthorized role assignments. Low risk of confusion in practice since only super_admins can use the bulk create dialog.
- **Exit criterion**: Re-open if bulk user creation is made available to non-super-admin roles.

---

## Deferred Items

| Finding | Severity | Reason | Exit Criterion |
|---------|----------|--------|----------------|
| L2 (anti-cheat LRU cache) | LOW | Already guarded by `getUnsupportedRealtimeGuard`; single-instance is documented deployment model | Re-open if multi-instance becomes supported for anti-cheat |
| L5 (bulk create elevated roles) | LOW | Server validates role assignments; only super_admins can use the dialog | Re-open if bulk create is available to non-super-admin roles |
