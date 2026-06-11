# Cycle 14 Comprehensive Deep Code Review

**Date:** 2026-04-19
**Reviewer:** Multi-angle review (code quality, security, performance, architecture, correctness, UI/UX, testing)
**Base commit:** 335f68df

---

## Findings

### F1: `resolveCapabilities` has redundant `roleName === "super_admin"` fallback that bypasses level check
- **File**: `src/lib/capabilities/cache.ts:103-106`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: After the level-based check at line 99 (`entry.level >= SUPER_ADMIN_LEVEL`), there is a second check at line 104: `if (roleName === "super_admin")`. This is documented as a "bootstrap shortcut" for when the cache hasn't loaded yet, but the function already calls `await ensureLoaded()` at line 93 before this check. If `ensureLoaded()` completes successfully, the cache will always contain "super_admin" (either from DB or from the built-in fallback at line 44-49). The only scenario where `ensureLoaded()` succeeds but the cache doesn't have "super_admin" is a catastrophic DB state where the roles table is empty AND the built-in fallback loop at line 44 somehow fails — which would indicate a bug, not a legitimate condition. More importantly, if a custom role is created with level >= SUPER_ADMIN_LEVEL but a different name, only the level check would protect it. The hardcoded fallback undermines the purpose of the level-based check by adding an inconsistent path.
- **Concrete failure scenario**: A custom role "uber_admin" with level 4 is created. The level check correctly returns ALL_CAPABILITIES. But the hardcoded check also returns ALL_CAPABILITIES for the built-in "super_admin" name even if somehow the cache entry was corrupted/missing its level. This creates two inconsistent code paths to the same result.
- **Fix**: Remove the `roleName === "super_admin"` shortcut (lines 103-106). The level-based check at line 99 and the built-in fallback in `loadRolesFromDb` already guarantee "super_admin" always gets ALL_CAPABILITIES. If bootstrap ordering is truly a concern, add a code comment explaining why the level check is sufficient.

### F2: `isAdmin()` sync helper in `auth.ts` uses hardcoded `ROLE_LEVEL` map, silently returns false for custom admin-level roles
- **File**: `src/lib/api/auth.ts:97-99`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: The synchronous `isAdmin()` function uses `ROLE_LEVEL[role as UserRole]` which only knows about the 5 built-in roles. For a custom role with admin-equivalent capabilities but a name not in `UserRole`, this returns `false`. The async `isAdminAsync()` correctly resolves via capabilities. However, `isAdmin()` is still actively used in `src/app/api/v1/groups/[id]/assignments/[assignmentId]/route.ts:109,181,223` to guard assignment problem modifications. A custom admin-level role would be blocked from editing assignment problems even though they have the `content.manage` capability.
- **Concrete failure scenario**: A custom role "dept_admin" with all admin capabilities is created. The user with this role tries to edit assignment problems on a contest that already has submissions. The `isAdmin(user.role)` check returns `false`, and the user is blocked with "assignmentProblemsLocked" even though they should have override permission.
- **Fix**: Replace the `isAdmin(user.role)` calls in the assignment route with `isAdminAsync(user.role)` or a capability check. The route is already async, so there is no reason to use the sync version.

### F3: Anti-cheat GET endpoint fetches ALL heartbeat rows for gap detection without pagination, potential memory spike
- **File**: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:185-193`
- **Severity**: MEDIUM
- **Confidence**: MEDIUM
- **Description**: When `userIdFilter` is provided and `assignment.enableAntiCheat` is true, the GET handler fetches ALL heartbeat events for that user in the contest without any limit. For a long-running contest with heartbeats every 60 seconds, a 3-hour contest would produce ~180 heartbeats per user, which is manageable. But a 24-hour contest would produce ~1440 heartbeats, and across many users being queried sequentially, this could add up. The in-memory gap detection at lines 196-209 is O(n) per user, which is fine algorithmically, but the unbounded SELECT could be problematic if many requests come in simultaneously.
- **Concrete failure scenario**: An instructor views anti-cheat data for a 48-hour contest, filtering by a specific user. The query returns ~2880 heartbeat rows into memory. Multiple concurrent instructor requests could cause memory pressure.
- **Fix**: Add a `LIMIT` clause to the heartbeat query (e.g., limit to the last 5000 events) or implement cursor-based pagination for the gap detection. Alternatively, compute gaps server-side with a SQL window function instead of pulling all rows into Node.js memory.

### F4: `validateShellCommand` regex has incorrect `<` and `>` matching that blocks legitimate command flags
- **File**: `src/lib/compiler/execute.ts:156`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: The regex `/`|\$\(|\$\{|[<>]\(|\|\||\||>|<|\n|\r|\beval\b/` includes bare `>` and `<` as denied patterns. However, these are also matched by the character class `[<>]\(` which is intended to block process substitution `<()` and `>()`. The bare `>` and `<` patterns will also reject commands containing redirect operators like `2>/dev/null` or input redirection, which are legitimate in compile commands (e.g., a compile command that redirects stderr). The comment at line 139 says "I/O redirect: > <" is denied, which suggests this is intentional, but the overlap with `[<>]\(` creates a maintenance risk. More importantly, the bare `<` pattern also matches comparison operators in some language contexts.
- **Concrete failure scenario**: An admin configures a compile command like `gcc -o main main.c 2>/dev/null`. The `>` in `2>/dev/null` triggers the deny, and the command is rejected.
- **Fix**: This appears intentional per the comment, but document it clearly. If redirect operators should be allowed in trusted admin commands, remove the bare `>` and `<` patterns and keep only `[<>]\(` for process substitution.

### F5: `canManageRole` sync function uses `getBuiltinRoleLevel` which returns -1 for custom roles, potentially allowing privilege escalation
- **File**: `src/lib/security/constants.ts:73-81`
- **Severity**: MEDIUM
- **Confidence**: MEDIUM
- **Description**: The synchronous `canManageRole()` uses `getBuiltinRoleLevel()` which returns -1 for custom roles (line 99: `DEFAULT_ROLE_LEVELS[role as UserRole] ?? -1`). When both actor and target are custom roles, `canManageRole` compares -1 > -1 = false, which is a safe default (deny). However, if an actor has a built-in role (e.g., admin, level 3) and the target is a custom role with level 4 stored in the DB, `canManageRole` would see level 3 > -1 = true and allow the admin to assign a custom super_admin-equivalent role. The async version `canManageRoleAsync` correctly uses `getRoleLevel()` from the cache. The sync version is still exported and could be used by future callers who don't realize it's unsafe for custom roles.
- **Concrete failure scenario**: A user with the built-in "admin" role (level 3) tries to assign a custom role "ultra_admin" (level 4 in DB). `canManageRole("admin", "ultra_admin")` returns `3 > -1 = true`, allowing the assignment. The admin has now assigned a role with higher privileges than their own.
- **Fix**: Either remove the sync `canManageRole` (there are no callers — the async version is used everywhere), or add a JSDoc warning and a runtime guard that returns false when either role is not a built-in role.

### F6: ~~Participant timeline route lacks access control~~ VERIFIED SAFE
- **File**: `src/app/api/v1/contests/[assignmentId]/participant-timeline/[userId]/route.ts`
- **Severity**: N/A (not an issue)
- **Confidence**: HIGH
- **Description**: Upon verification, the route properly uses `auth: { capabilities: ["contests.view_analytics"] }` and `canViewAssignmentSubmissions(assignmentId, user.id, user.role)`. No access control issue exists.
- **Action**: No fix needed.

### F7: Error boundary components use `console.error` instead of structured logger
- **File**: `src/app/(dashboard)/dashboard/admin/error.tsx:17`, `src/app/(dashboard)/dashboard/submissions/error.tsx:17`, `src/app/(dashboard)/dashboard/problems/error.tsx:17`, `src/app/(dashboard)/dashboard/groups/error.tsx:17`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: Four error boundary components use `console.error(error)` instead of the structured logger. In production, these errors are not captured by the logging infrastructure and may be lost. The rest of the codebase consistently uses `logger.error()`.
- **Fix**: Replace `console.error(error)` with `logger.error({ err: error }, "Uncaught error in error boundary")` in all four files. Note: error boundaries are client components, so verify that the logger works in client context or use a client-safe logging approach.

### F8: `communityVotes` transaction score summary may be stale if another transaction commits between the vote change and the summary read
- **File**: `src/app/api/v1/community/votes/route.ts:110-121`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The score summary query at lines 110-121 runs inside the same transaction as the vote change, which is correct for preventing TOCTOU on the vote itself. However, in PostgreSQL's default READ COMMITTED isolation, the summary query sees the vote change from the current transaction but also sees concurrent committed changes from other transactions. This means the returned score could include votes from other users that were committed between the vote change and the summary read. This is actually correct behavior for a vote count — you want the most up-to-date count. Not a real bug, but worth noting for documentation clarity.
- **Fix**: Add a code comment explaining the isolation semantics.

### F9: `use-source-draft` hook silently swallows localStorage errors with empty `catch {}`
- **File**: `src/hooks/use-source-draft.ts:63,70`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: Two `catch {}` blocks silently swallow all errors from `localStorage.getItem` and `localStorage.setItem`. While localStorage operations rarely throw in normal conditions, they can fail in Safari private browsing mode or when storage quota is exceeded. A `catch {}` makes debugging impossible.
- **Fix**: Add at minimum a `console.debug` or `logger.debug` call in the catch blocks, or narrow the catch to `DOMException` / `QuotaExceededError`.

### F10: Role cache TTL uses `Date.now()` which can drift in long-running processes
- **File**: `src/lib/capabilities/cache.ts:66`
- **Severity**: LOW
- **Confidence**: LOW
- **Description**: The role cache uses `Date.now() - roleCacheLoadedAt < ROLE_CACHE_TTL_MS` for expiry. In very long-running Node.js processes, `Date.now()` can drift if the system clock is adjusted (e.g., NTP correction). This is a theoretical concern — the 60-second TTL makes clock drift negligible. Already noted as deferred item A19 in prior cycles.
- **Fix**: No action needed — already deferred.

---

## Summary

| ID | Severity | Confidence | Finding |
|----|----------|------------|---------|
| F1 | MEDIUM | HIGH | Redundant `roleName === "super_admin"` in resolveCapabilities |
| F2 | MEDIUM | HIGH | `isAdmin()` sync function used in assignment route, fails for custom roles |
| F3 | MEDIUM | MEDIUM | Anti-cheat heartbeat gap detection queries all rows without limit |
| F4 | LOW | HIGH | Shell command validator blocks legitimate redirect operators |
| F5 | MEDIUM | MEDIUM | `canManageRole` sync allows privilege escalation for custom roles |
| F6 | MEDIUM | MEDIUM | Participant timeline route may lack proper access control |
| F7 | LOW | HIGH | Error boundaries use console.error instead of structured logger |
| F8 | LOW | MEDIUM | Community votes transaction isolation semantics (documentation only) |
| F9 | LOW | HIGH | use-source-draft silently swallows localStorage errors |
| F10 | LOW | LOW | Role cache TTL clock drift (already deferred) |
