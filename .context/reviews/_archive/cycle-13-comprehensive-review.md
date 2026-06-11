# Cycle 13 Deep Code Review — JudgeKit

**Date:** 2026-04-19
**Reviewer:** Comprehensive multi-angle review (code quality, security, performance, architecture, correctness, consistency, UI/UX)
**Scope:** Full repository — `src/`, configuration files
**Delta from prior cycle:** Focus on new issues not covered in cycles 1-12, verifying previously reported items

---

## F1: Community votes route has read-then-write race condition (not wrapped in transaction)

- **File**: `src/app/api/v1/community/votes/route.ts:78-107`
- **Severity**: MEDIUM | **Confidence**: High
- **Description**: The vote toggle logic performs a `findFirst()` read (line 78), then branches into `delete` (line 88), `update` (line 90), or `insert` (line 98) based on the result. This is a classic TOCTOU pattern. Two concurrent requests from the same user can both read `existing` as null (or both read the same voteType), then both attempt an insert. The `onConflictDoUpdate` on the insert path (line 103) partially mitigates this for the insert case, but the delete and update paths have no such protection. For example:
  - User sends two rapid "upvote" requests. Both read `existing.voteType === "up"`, both delete the vote. The vote is deleted, but the response from one request will show an incorrect score.
  - User has an "up" vote and sends a "down" vote concurrently. One request reads `existing.voteType === "up"` and updates to "down", while the other also reads "up" (before the first commit) and also updates to "down". Both succeed, but the score calculation after each may be wrong because one update overwrites the other.
- **Concrete failure scenario**: Two concurrent "upvote" toggles from the same user. Both read existing upvote, both delete it. The vote disappears. The first response shows score=0, the second also shows score=0 (correct). But if one was "upvote" and the other "downvote" arriving simultaneously, the final state is indeterminate — the vote could end up as "down" or deleted depending on timing.
- **Fix**: Wrap the read-check-write in a `db.transaction()` with `SELECT ... FOR UPDATE` on the existing vote row, OR refactor to use a single atomic SQL statement:
  ```ts
  // Option A: Transaction with explicit locking
  await db.transaction(async (tx) => {
    const [existing] = await tx.select({...}).from(communityVotes).where(...).limit(1).for("update");
    // ... branch logic within tx
  });
  ```
  The existing `onConflictDoUpdate` already handles the insert-race case, so the primary gap is the delete and update paths.

## F2: `validateRoleChange` (deprecated sync version) still has hardcoded `=== "super_admin"` check

- **File**: `src/lib/users/core.ts:96`
- **Severity**: MEDIUM | **Confidence**: High
- **Description**: While `validateRoleChangeAsync` was fixed in cycle 12 to use `isSuperAdminRole()`, the deprecated sync `validateRoleChange` at line 96 still has `targetCurrentRole === "super_admin"`. The function is marked `@deprecated` but is still exported and available for import. Any caller still using the sync version would have the same vulnerability as cycle-12 F1. Currently, all server-side callers appear to use `validateRoleChangeAsync`, but the deprecated function remains a footgun for future code.
- **Concrete failure scenario**: A developer adds a new API route that calls `validateRoleChange` (the sync version) because it's simpler. A custom super_admin-equivalent role can have its role changed by non-super-admin actors.
- **Fix**: Either remove the deprecated function entirely (if no callers exist), or add a runtime warning and update the check to use a synchronous `isSuperAdminRoleSync()` helper, or make the function throw with a message directing to `validateRoleChangeAsync`.

## F3: Analytics page uses raw `sql` template with embedded subquery without parameterization

- **File**: `src/app/(dashboard)/dashboard/groups/[id]/analytics/page.tsx:71`
- **Severity**: LOW | **Confidence**: High
- **Description**: Line 71 constructs a SQL WHERE clause using Drizzle's `sql` template:
  ```ts
  .where(and(
    eq(submissions.assignmentId, sql`ANY (${db.select({ id: assignments.id }).from(assignments).where(eq(assignments.groupId, groupId))})`),
    sql`${submissions.status} NOT IN ('pending', 'queued', 'judging')`
  ))
  ```
  While `groupId` is validated earlier (from the URL params and confirmed via `canAccessGroup`), the `sql` template with embedded Drizzle subquery is fragile and hard to audit. The `NOT IN` status check uses raw SQL strings which could drift from the schema's enum definition. Additionally, this approach creates an uncorrelated subquery that runs for every row rather than using a proper JOIN.
- **Concrete failure scenario**: If new submission statuses are added to the schema (e.g., "rejudging"), the raw SQL `NOT IN` list must be manually updated. If forgotten, rejudging submissions would be included in analytics, skewing statistics.
- **Fix**: Refactor to use a proper Drizzle subquery with `inArray` or a JOIN, and derive the excluded status list from the schema definition:
  ```ts
  const assignmentIds = db.select({ id: assignments.id }).from(assignments).where(eq(assignments.groupId, groupId));
  // Use inArraySubquery instead of raw sql`ANY (...)`
  ```

## F4: Anti-cheat heartbeat `lastHeartbeatTime` LRU cache is process-local, inconsistent with shared coordination

- **File**: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:16,85-91`
- **Severity**: LOW | **Confidence**: Medium
- **Description**: The anti-cheat POST handler uses an in-process `LRUCache` (`lastHeartbeatTime`) for deduplicating heartbeat events (lines 85-91). When `usesSharedRealtimeCoordination()` is true, the code delegates to `shouldRecordSharedHeartbeat()` which uses PostgreSQL advisory locks for correctness. But when shared coordination is NOT configured, the LRU cache is process-local. In a multi-instance deployment (which is explicitly guarded against for SSE but not for anti-cheat heartbeats), different instances would have separate caches, allowing duplicate heartbeats to be inserted.
- **Concrete failure scenario**: In a multi-instance deployment without shared realtime coordination, a student's heartbeat event could be recorded multiple times (once per instance) within the 60-second deduplication window, creating misleading heartbeat gap analysis.
- **Fix**: This is already partially mitigated by the `getUnsupportedRealtimeGuard` check (line 37) which blocks the endpoint entirely when multi-instance is detected without shared coordination. The risk is only if someone bypasses the guard. Document that the LRU cache is only reliable in single-instance mode, and ensure the guard at line 37 blocks anti-cheat routes in multi-instance deployments.

## F5: `role-editor-dialog.tsx` uses hardcoded `role?.name === "super_admin"` for UI-level capability matrix disabling

- **File**: `src/app/(dashboard)/dashboard/admin/roles/role-editor-dialog.tsx:83,114`
- **Severity**: LOW | **Confidence**: High
- **Description**: Lines 83 and 114 check `role?.name === "super_admin"` to decide whether to omit the `capabilities` field from the PATCH body and to disable the capability matrix. This is a client-side UI concern (the server validates and protects super_admin capabilities), so it's not a security vulnerability. However, if a custom role has super_admin-level privileges, the UI would still show the capability matrix as editable for that role, while the server would reject any capability changes. This creates a confusing UX.
- **Concrete failure scenario**: An admin edits a custom role "platform_admin" that has super_admin level. The UI shows the capability matrix as editable, the admin modifies capabilities and clicks Save, and the server silently drops the capabilities field (because the PATCH route checks `isBuiltin` and `isSuperAdminRole`). The admin thinks they changed capabilities but nothing happened.
- **Fix**: Pass the role's `level` (available from the RoleData interface which includes `level: number`) and check `role.level >= SUPER_ADMIN_LEVEL` instead of `role?.name === "super_admin"`. Import `SUPER_ADMIN_LEVEL` or derive it from the capabilities data already loaded on the page.

## F6: `user-actions.tsx` hides action buttons for `userRole === "super_admin"` via hardcoded string

- **File**: `src/app/(dashboard)/dashboard/admin/users/user-actions.tsx:80`
- **Severity**: LOW | **Confidence**: High
- **Description**: Line 80 checks `userRole === "super_admin"` to hide the deactivate/delete buttons. This is a client-side convenience (the server enforces the actual protection), but it means custom super_admin-equivalent roles would still show action buttons. The server would then reject the action with `cannotDeactivateSuperAdmin`, creating a confusing UX where the button appears but the action fails.
- **Concrete failure scenario**: An admin views a user with custom role "platform_admin" at super_admin level. The deactivate button appears. Admin clicks it, server action returns `cannotDeactivateSuperAdmin`, showing an error toast. The button should have been hidden.
- **Fix**: Pass the user's `level` to the component and check `level >= SUPER_ADMIN_LEVEL` instead of `userRole === "super_admin"`.

## F7: `bulk-create-dialog.tsx` normalizeRole allows "admin" and "super_admin" roles from CSV import

- **File**: `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:77-79`
- **Severity**: LOW | **Confidence**: Medium
- **Description**: The `normalizeRole` function at line 77 maps CSV values "admin" and "super_admin" to those exact role strings. The bulk user creation API route should validate role assignments (and likely does via `validateRoleChangeAsync`), but the client-side normalization explicitly allows "admin" and "super_admin" in the preview table. If a non-super-admin instructor uploads a CSV with role "admin" or "super_admin", the preview would show those roles being assigned, and the server would reject the entire batch or individual rows, creating confusion.
- **Concrete failure scenario**: An instructor uploads a CSV with `role: admin` for a student. The preview shows the student will be created as "admin". The bulk create API returns an error for that row. The instructor is confused about why the preview allowed it.
- **Fix**: Consider filtering "admin" and "super_admin" from the client-side normalization (mapping them to "student" or showing a warning), or at minimum showing a warning in the preview when elevated roles are specified.

---

## Previously Deferred Items (Still Active)

These remain from prior cycles and are not re-lifted:

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| A19 | `new Date()` clock skew risk | LOW | Deferred — only affects distributed deployments with unsynchronized clocks |
| A7 | Dual encryption key management | MEDIUM | Deferred — consolidation requires migration |
| A12 | Inconsistent auth/authorization patterns | MEDIUM | Deferred — existing routes work correctly |
| A2 | Rate limit eviction could delete SSE slots | MEDIUM | Deferred — unlikely with heartbeat refresh |
| A17 | JWT contains excessive UI preference data | LOW | Deferred — requires session restructure |
| A25 | Timing-unsafe bcrypt fallback | LOW | Deferred — bcrypt-to-argon2 migration in progress |
| A26 | Polling-based backpressure wait | LOW | Deferred — no production reports |

---

## Summary Statistics
- Total new findings this cycle: 7
- Critical: 0
- High: 0
- Medium: 2 (F1 — community votes race condition, F2 — deprecated validateRoleChange still hardcoded)
- Low: 5 (F3 — analytics raw SQL, F4 — anti-cheat LRU cache inconsistency, F5 — role editor UI hardcoded check, F6 — user actions UI hardcoded check, F7 — bulk create allows elevated roles)
