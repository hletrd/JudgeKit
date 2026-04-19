# Aggregate Review — Cycle 14 Deep Code Review

**Date:** 2026-04-19
**Source reviews:**
- `cycle-14-comprehensive-review.md` (comprehensive multi-angle review covering code quality, security, performance, architecture, correctness, UI/UX, testing)
- Prior cycles 1-13 reviews (findings already addressed or deferred in prior plan documents)

---

## CRITICAL (Immediate Action Required)

None.

---

## HIGH (Should Fix This Cycle)

None.

---

## MEDIUM (Should Fix Soon)

### M1: Redundant `roleName === "super_admin"` shortcut in `resolveCapabilities`
- **Source**: cycle-14 F1
- **Files**: `src/lib/capabilities/cache.ts:103-106`
- **Description**: After the level-based check at line 99, there is a hardcoded `roleName === "super_admin"` fallback at line 104. This is documented as a bootstrap shortcut, but `ensureLoaded()` (called at line 93) always populates the built-in roles (including "super_admin") from either DB or the hardcoded fallback in `loadRolesFromDb`. The redundant check creates an inconsistent code path that undermines the level-based design pattern. Custom roles at super_admin level only go through the level check; the built-in name has a second shortcut.
- **Fix**: Remove lines 103-106. The level-based check at line 99 and the built-in fallback in `loadRolesFromDb` already guarantee "super_admin" always gets ALL_CAPABILITIES.

### M2: `isAdmin()` sync function used in assignment route, silently fails for custom admin-level roles
- **Source**: cycle-14 F2
- **Files**: `src/app/api/v1/groups/[id]/assignments/[assignmentId]/route.ts:109,181,223`; `src/lib/api/auth.ts:97-99`
- **Description**: The synchronous `isAdmin()` function uses the hardcoded `ROLE_LEVEL` map which only knows 5 built-in roles. A custom role with admin-equivalent capabilities would get `isAdmin() === false`. The assignment route uses `isAdmin(user.role)` to gate assignment problem modifications for contests with existing submissions. Custom admin-level users would be blocked from editing assignment problems despite having the necessary capabilities.
- **Fix**: Replace the 3 calls to `isAdmin(user.role)` with `isAdminAsync(user.role)` or a capability check (`resolveCapabilities(user.role).has("content.manage")`). The route is already async.

### M3: Unbounded `canManageRole` sync function is exported but has zero callers and is unsafe for custom roles
- **Source**: cycle-14 F5
- **Files**: `src/lib/security/constants.ts:73-81`
- **Description**: The synchronous `canManageRole()` uses `getBuiltinRoleLevel()` which returns -1 for custom roles. When an actor has a built-in role (e.g., admin, level 3) and the target is a custom role with level 4, `canManageRole("admin", "ultra_admin")` returns `3 > -1 = true`, allowing the admin to assign a role with higher privileges. The async `canManageRoleAsync` correctly uses `getRoleLevel()` from the cache. Currently has zero callers.
- **Fix**: Remove the unused `canManageRole` sync function entirely, or add a runtime guard that throws when either role is not a built-in role.

### M4: Anti-cheat heartbeat gap detection fetches all rows without limit
- **Source**: cycle-14 F3
- **Files**: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:185-193`
- **Description**: When a userId filter is provided, the GET handler fetches ALL heartbeat events for that user in the contest. For long-running contests (24h+), this could return thousands of rows per request. Multiple concurrent requests could cause memory pressure.
- **Fix**: Add a reasonable `LIMIT` to the heartbeat query (e.g., 5000 most recent events), or compute gaps server-side with a SQL window function.

---

## LOW (Best Effort / Track)

### L1: Error boundary components use `console.error` instead of structured logger
- **Source**: cycle-14 F7
- **Files**: `src/app/(dashboard)/dashboard/admin/error.tsx:17`, `submissions/error.tsx:17`, `problems/error.tsx:17`, `groups/error.tsx:17`
- **Description**: Four error boundary components use `console.error(error)` instead of the structured logger. In production, these errors may not be captured by the logging infrastructure.
- **Fix**: Replace with `logger.error()` or a client-safe logging approach.

### L2: `use-source-draft` hook silently swallows localStorage errors
- **Source**: cycle-14 F9
- **Files**: `src/hooks/use-source-draft.ts:63,70`
- **Description**: Two `catch {}` blocks silently swallow all errors from localStorage operations. Makes debugging impossible when storage fails (Safari private mode, quota exceeded).
- **Fix**: Add `console.debug` or `logger.debug` in the catch blocks.

### L3: Shell command validator blocks legitimate redirect operators (intentional)
- **Source**: cycle-14 F4
- **Files**: `src/lib/compiler/execute.ts:156`
- **Description**: The regex includes bare `>` and `<` which block I/O redirect operators like `2>/dev/null`. This appears intentional per the denylist comment, but could surprise admins configuring compile commands.
- **Fix**: Document in the admin UI that redirect operators are not allowed in compile/run commands.

### L4: Community votes transaction isolation semantics (documentation only)
- **Source**: cycle-14 F8
- **Files**: `src/app/api/v1/community/votes/route.ts:110-121`
- **Description**: The score summary query inside the transaction uses READ COMMITTED isolation, so the returned count may include concurrent votes from other users. This is correct behavior but could benefit from a code comment.
- **Fix**: Add a comment explaining the isolation semantics.

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
| L2(c13) | Anti-cheat LRU cache single-instance limitation | LOW | Deferred — already guarded by getUnsupportedRealtimeGuard |
| L5(c13) | Bulk create elevated roles warning | LOW | Deferred — server validates role assignments |
