# Cycle 12 Deep Code Review — JudgeKit

**Date:** 2026-04-19
**Reviewer:** Comprehensive multi-angle review (code quality, security, performance, architecture, correctness, consistency)
**Scope:** Full repository — `src/`, configuration files
**Delta from prior cycle:** Focus on new issues not covered in cycles 1-11, verifying previously reported items

---

## F1: `validateRoleChange`/`validateRoleChangeAsync` in `core.ts` use hardcoded `=== "super_admin"` instead of `isSuperAdminRole()`
- **File**: `src/lib/users/core.ts:93,113`
- **Severity**: MEDIUM | **Confidence**: High
- **Description**: Both `validateRoleChange()` (line 93) and `validateRoleChangeAsync()` (line 113) check `targetCurrentRole === "super_admin"` using hardcoded string comparison. This is the same class of bug fixed in cycle 3 (AUTH-01) and cycle 11 (F4) for other routes. Custom roles with super_admin-level privileges would bypass this safety rail, allowing their role to be changed by non-super-admin actors.
- **Concrete failure scenario**: A custom role "platform_admin" is created with super_admin-level capabilities and level. An admin attempts to downgrade a "platform_admin" user to "instructor". The check `targetCurrentRole === "super_admin"` fails (it's "platform_admin"), so the downgrade is allowed — a super_admin-equivalent user loses their privileges.
- **Fix**: Import `isSuperAdminRole` from `@/lib/capabilities/cache` and replace both hardcoded checks:
  ```ts
  // Line 93 (sync)
  if ((await isSuperAdminRole(targetCurrentRole)) && !(await isSuperAdminRole(requestedRole))) {
  // Line 113 (async)
  if ((await isSuperAdminRole(targetCurrentRole)) && !(await isSuperAdminRole(requestedRole))) {
  ```
  Note: `validateRoleChange` (sync) would need to become async, OR a sync version of `isSuperAdminRole` using the built-in defaults could be added. Alternatively, since `validateRoleChangeAsync` already exists, callers of `validateRoleChange` should be migrated to the async version.

## F2: `POST /admin/roles` uses hardcoded local `ROLE_LEVELS` map with inconsistent values (same pattern as cycle-11 F5)
- **File**: `src/app/api/v1/admin/roles/route.ts:63-64`
- **Severity**: MEDIUM | **Confidence**: High
- **Description**: The POST handler at line 63 defines a local `ROLE_LEVELS` object: `{ student: 0, assistant: 0, ta: 1, instructor: 1, admin: 2, super_admin: 3 }`. This is the same bug as cycle-11 F5 (which was in the PATCH route and was fixed), but the POST route was missed. The level values are inconsistent with the canonical `ROLE_LEVEL` in `src/lib/security/constants.ts` (which has `student: 0, assistant: 1, instructor: 2, admin: 3, super_admin: 4`). Custom roles get level `-1` from `ROLE_LEVELS[user.role] ?? -1`, meaning an admin with a custom role cannot create any role.
- **Concrete failure scenario**: An admin with custom role "head_ta" (level 2) tries to create a role with level 1. `ROLE_LEVELS["head_ta"]` is `-1`, so the check `level > creatorLevel` becomes `1 > -1` which is true, blocking the creation.
- **Fix**: Replace the local `ROLE_LEVELS` map with `getRoleLevel()` from `@/lib/capabilities/cache` (same fix as cycle-11 F5 for the PATCH route).

## F3: `resolveCapabilities` in `cache.ts` uses hardcoded `roleName === "super_admin"` shortcut
- **File**: `src/lib/capabilities/cache.ts:94`
- **Severity**: LOW | **Confidence**: High
- **Description**: `resolveCapabilities()` has an early-return shortcut `if (roleName === "super_admin") return new Set(ALL_CAPABILITIES)` at line 94. While functionally correct for the built-in "super_admin" role, this bypasses the cache for any custom role that has super_admin-equivalent level. A custom role with level >= SUPER_ADMIN_LEVEL would still be looked up in the cache rather than receiving ALL_CAPABILITIES, which is inconsistent with the intent documented at line 7: "super_admin always has ALL capabilities regardless of DB state".
- **Concrete failure scenario**: A custom role "platform_admin" is created with super_admin level (4) but its `capabilities` column in the DB is accidentally set to an empty array. `resolveCapabilities("platform_admin")` returns an empty set instead of ALL_CAPABILITIES, because the early-return shortcut only matches the literal string "super_admin".
- **Fix**: Replace the shortcut with a level-based check:
  ```ts
  if (await isSuperAdminRole(roleName)) {
    return new Set(ALL_CAPABILITIES);
  }
  ```
  OR add the check after `ensureLoaded()` so the cache is available:
  ```ts
  await ensureLoaded();
  const entry = roleCache?.get(roleName);
  if (entry && entry.level >= SUPER_ADMIN_LEVEL) {
    return new Set(ALL_CAPABILITIES);
  }
  if (entry) return entry.capabilities;
  return new Set();
  ```

## F4: `GET /api/v1/languages` (public, no auth) loads full `languageConfigs` rows including `compileCommand`, `runCommand`, `dockerfile`
- **File**: `src/app/api/v1/languages/route.ts:11-14`
- **Severity**: LOW | **Confidence**: High
- **Description**: The public languages endpoint (auth: false) uses `db.select().from(languageConfigs)` without column restriction. It then discards all columns except `id` and `language` (the `getJudgeLanguageDefinition` call derives display info from the language key). The `compileCommand`, `runCommand`, and `dockerfile` columns may contain sensitive operational data and are loaded from the DB on every request, only to be thrown away. More importantly, this is an unauthenticated endpoint, so the data travels over the wire to anonymous users.
- **Concrete failure scenario**: An anonymous user hits the public languages endpoint. The DB returns full language config rows including compile commands and Docker image names. While the response only includes `id`, `language`, `displayName`, `standard`, `extension`, the full rows were loaded into server memory unnecessarily. On a high-traffic endpoint, this is wasted DB I/O.
- **Fix**: Add explicit column selection:
  ```ts
  const languages = await db
    .select({
      id: languageConfigs.id,
      language: languageConfigs.language,
      isEnabled: languageConfigs.isEnabled,
    })
    .from(languageConfigs)
    .where(eq(languageConfigs.isEnabled, true));
  ```

## F5: `GET /api/v1/files/[id]` loads full file row before access check
- **File**: `src/app/api/v1/files/[id]/route.ts:71-75`
- **Severity**: LOW | **Confidence**: High
- **Description**: The file serve endpoint uses `db.select().from(files)` without column restriction at line 72. The full row is loaded before the access check at line 81. While the `files` table doesn't contain extremely sensitive columns, the row is loaded unnecessarily before confirming the user is authorized. If the table were to gain sensitive metadata columns in the future, they'd be exposed in server memory to unauthorized requesters.
- **Concrete failure scenario**: Minor — extra columns loaded on each file access request. The `files` table currently has no highly sensitive columns, so this is more about defense-in-depth and consistency with other routes that were fixed.
- **Fix**: Add explicit column selection or keep the full select if all columns are needed for the response (the file metadata is sent to authorized users).

## F6: `GET /api/v1/groups/[id]/assignments/[assignmentId]/overrides` uses uncolumned select on `scoreOverrides`
- **File**: `src/app/api/v1/groups/[id]/assignments/[assignmentId]/overrides/route.ts:148`
- **Severity**: LOW | **Confidence**: Medium
- **Description**: The GET handler uses `db.select().from(scoreOverrides)` without column restriction. The `scoreOverrides` table is small (no large text fields), and the route returns all columns to the client anyway. This is flagged for consistency with the pattern of explicit column selection adopted in prior cycles.
- **Concrete failure scenario**: If new columns (e.g., audit metadata) are added to `scoreOverrides` in the future, they'd be silently exposed to the API.
- **Fix**: Add explicit column selection matching the response shape.

## F7: Admin roles GET/PATCH/DELETE use uncolumned selects on `roles` table
- **Files**:
  - `src/app/api/v1/admin/roles/[id]/route.ts:20,47,105,122`
  - `src/app/api/v1/admin/roles/route.ts:127`
- **Severity**: LOW | **Confidence**: Medium
- **Description**: Multiple role management endpoints use `db.select().from(roles)` without column restriction. The `roles` table contains `capabilities` (a JSON array) which is returned to the client for admin use. Since these are all admin-only endpoints, the full select is arguably justified. Flagged for consistency.
- **Concrete failure scenario**: If new columns are added to `roles` (e.g., internal notes, audit metadata), they'd be silently exposed in admin API responses.
- **Fix**: Add explicit column selection matching the response shape.

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
- Medium: 2 (F1 — hardcoded super_admin in validateRoleChange, F2 — inconsistent ROLE_LEVELS in roles POST)
- Low: 5 (F3 — resolveCapabilities shortcut, F4 — uncolumned select on public languages, F5 — uncolumned select on files GET, F6 — uncolumned select on overrides GET, F7 — uncolumned selects on admin roles)
