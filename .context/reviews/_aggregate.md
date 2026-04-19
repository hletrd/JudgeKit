# Aggregate Review — Cycle 13 Deep Code Review

**Date:** 2026-04-19
**Source reviews:**
- `cycle-13-comprehensive-review.md` (comprehensive multi-angle review covering code quality, security, performance, architecture, correctness, consistency)
- Prior cycles 1-12 reviews (findings already addressed or deferred in prior plan documents)

---

## CRITICAL (Immediate Action Required)

None.

---

## HIGH (Should Fix This Cycle)

None.

---

## MEDIUM (Should Fix Soon)

### M1: Community votes route has read-then-write race condition
- **Source**: cycle-13 F1
- **Files**: `src/app/api/v1/community/votes/route.ts:78-107`
- **Description**: Vote toggle logic performs `findFirst()` then branches to `delete`/`update`/`insert` without a transaction. Concurrent requests from the same user can result in double-deletes or inconsistent score calculations. The `onConflictDoUpdate` on the insert path partially mitigates the insert race, but the delete and update paths have no protection.
- **Fix**: Wrap the read-check-write in a `db.transaction()` with row-level locking, or refactor to a single atomic SQL statement.

### M2: Deprecated `validateRoleChange` still has hardcoded `=== "super_admin"` check
- **Source**: cycle-13 F2
- **Files**: `src/lib/users/core.ts:96`
- **Description**: The deprecated sync version of `validateRoleChange` still uses `targetCurrentRole === "super_admin"` at line 96. While `validateRoleChangeAsync` was fixed in cycle 12, the deprecated function remains exported and is a footgun for future callers. Custom super_admin-equivalent roles would bypass the protection.
- **Fix**: Remove the deprecated function (no current callers use it), or add a synchronous `isSuperAdminRoleSync()` helper, or throw at runtime directing to the async version.

---

## LOW (Best Effort / Track)

### L1: Analytics page uses raw `sql` template with embedded subquery
- **Source**: cycle-13 F3
- **Files**: `src/app/(dashboard)/dashboard/groups/[id]/analytics/page.tsx:71`
- **Description**: Raw `sql` template with embedded Drizzle subquery and hardcoded status strings (`NOT IN ('pending', 'queued', 'judging')`). Fragile if new statuses are added to the schema. Also uses an uncorrelated subquery instead of a proper JOIN.
- **Fix**: Refactor to use Drizzle's `inArray` with a proper subquery, and derive excluded status list from the schema.

### L2: Anti-cheat heartbeat LRU cache is process-local, inconsistent with shared coordination
- **Source**: cycle-13 F4
- **Files**: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:16,85-91`
- **Description**: In-process LRU cache for heartbeat deduplication is process-local. In multi-instance deployments without shared coordination, duplicate heartbeats could be recorded. Already partially mitigated by the `getUnsupportedRealtimeGuard` check.
- **Fix**: Document that the LRU cache is only reliable in single-instance mode; ensure the guard blocks anti-cheat routes in multi-instance deployments.

### L3: Role editor dialog uses hardcoded `role?.name === "super_admin"` for UI behavior
- **Source**: cycle-13 F5
- **Files**: `src/app/(dashboard)/dashboard/admin/roles/role-editor-dialog.tsx:83,114`
- **Description**: Client-side UI checks hardcoded role name instead of level. Custom super_admin-equivalent roles would show editable capabilities in the UI, but the server would reject changes. Confusing UX.
- **Fix**: Check `role.level >= SUPER_ADMIN_LEVEL` instead of `role?.name === "super_admin"`.

### L4: User actions component uses hardcoded `userRole === "super_admin"` to hide buttons
- **Source**: cycle-13 F6
- **Files**: `src/app/(dashboard)/dashboard/admin/users/user-actions.tsx:80`
- **Description**: Client-side convenience check hides deactivate/delete buttons for "super_admin" by name only. Custom super_admin-equivalent roles would still show the buttons, but the server would reject the action.
- **Fix**: Pass the user's `level` and check `level >= SUPER_ADMIN_LEVEL`.

### L5: Bulk create dialog normalizes "admin" and "super_admin" roles from CSV without warning
- **Source**: cycle-13 F7
- **Files**: `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:77-79`
- **Description**: Client-side normalization allows "admin" and "super_admin" from CSV import. Preview shows these roles but server would reject. Confusing UX for non-super-admin instructors.
- **Fix**: Filter elevated roles from normalization or show a warning in the preview.

---

## Previously Deferred Items (Still Active)

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| A19 | `new Date()` clock skew risk | LOW | Deferred — only affects distributed deployments with unsynchronized clocks |
| A7 | Dual encryption key management | MEDIUM | Deferred — consolidation requires migration |
| A12 | Inconsistent auth/authorization patterns | MEDIUM | Deferred — existing routes work correctly |
| A2 | Rate limit eviction could delete SSE slots | MEDIUM | Deferred — unlikely with heartbeat refresh |
| A17 | JWT contains excessive UI preference data | LOW | Deferred — requires session restructure |
| A25 | Timing-unsafe bcrypt fallback | LOW | Deferred — bcrypt-to-argon2 migration in progress |
| A26 | Polling-based backpressure wait | LOW | Deferred — no production reports |
