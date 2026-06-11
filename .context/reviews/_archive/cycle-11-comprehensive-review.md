# Cycle 11 Deep Code Review — JudgeKit

**Date:** 2026-04-19
**Reviewer:** Comprehensive multi-angle review (code quality, security, performance, architecture, correctness, consistency)
**Scope:** Full repository — `src/`, configuration files
**Delta from prior cycle:** Focus on new issues not covered in cycles 1-10, verifying previously reported items

---

## F1: `api-key-auth.ts` loads full API key row including `encryptedKey` during authentication
- **File**: `src/lib/api/api-key-auth.ts:71-75`
- **Severity**: MEDIUM | **Confidence**: High
- **Description**: `authenticateApiKey()` calls `db.select().from(apiKeys)` without column restriction. This loads all columns including `encryptedKey` (which can be large — base64-encoded AES-GCM ciphertext + IV + tag) and `keyHash` into memory during every API key authentication. The auth flow only needs `id`, `role`, `createdById`, `expiresAt`, and `isActive`. Loading `encryptedKey` on every API key request is a data-minimization concern and wastes memory.
- **Concrete failure scenario**: Every API-key-authenticated request loads a potentially large `encryptedKey` column into Node.js memory unnecessarily. On a high-traffic API endpoint, this is wasted heap allocation and DB I/O.
- **Fix**: Replace `db.select().from(apiKeys)` with explicit column selection:
  ```ts
  const [candidate] = await db
    .select({
      id: apiKeys.id,
      role: apiKeys.role,
      createdById: apiKeys.createdById,
      expiresAt: apiKeys.expiresAt,
      isActive: apiKeys.isActive,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true)))
    .limit(1);
  ```

## F2: Admin API keys GET endpoint loads `encryptedKey` column just to derive a boolean
- **File**: `src/app/api/v1/admin/api-keys/route.ts:33,39-42`
- **Severity**: LOW | **Confidence**: High
- **Description**: The GET handler explicitly selects `encryptedKey: apiKeys.encryptedKey` at line 33, only to check `encryptedKey != null` at line 41 and then discard the value. This loads potentially large encrypted key data from the DB for every API key row in the list, just to derive a `hasEncryptedKey: boolean`. A SQL expression like `encryptedKey IS NOT NULL` would avoid transferring the encrypted data.
- **Concrete failure scenario**: Admin opens the API keys management page. If there are 50 API keys, 50 encrypted key blobs are loaded from the DB and immediately discarded. The data transfer is wasted.
- **Fix**: Replace `encryptedKey: apiKeys.encryptedKey` with a SQL expression:
  ```ts
  hasEncryptedKey: sql<boolean>`${apiKeys.encryptedKey} IS NOT NULL`,
  ```
  Then remove the `.map()` transform at line 39.

## F3: Docker image build route loads full `languageConfigs` row without column restriction
- **File**: `src/app/api/v1/admin/docker/images/build/route.ts:25`
- **Severity**: LOW | **Confidence**: High
- **Description**: The POST handler calls `db.select().from(languageConfigs).where(...)` without column restriction. The route only needs `dockerImage` to derive the image name and validate it. The `languageConfigs` table may contain large fields like `compileCommand` and `runCommand` which are not needed for this operation.
- **Concrete failure scenario**: An admin triggers a Docker image build for a language. The full language config row (including compile/run commands) is loaded from the DB when only `dockerImage` is needed. Minor wasted DB I/O.
- **Fix**: Add explicit column selection:
  ```ts
  const [langConfig] = await db
    .select({ dockerImage: languageConfigs.dockerImage })
    .from(languageConfigs)
    .where(eq(languageConfigs.language, body.language))
    .limit(1);
  ```

## F4: Roles PATCH route uses hardcoded `role.name === "super_admin"` instead of `isSuperAdminRole()`
- **File**: `src/app/api/v1/admin/roles/[id]/route.ts:59`
- **Severity**: MEDIUM | **Confidence**: High
- **Description**: Line 59 checks `role.name === "super_admin"` using a hardcoded string comparison. The codebase has an `isSuperAdminRole()` helper (introduced in cycle 3 AUTH-01) in `src/lib/capabilities/cache.ts` that uses capability-based role level comparison. Custom roles with super_admin-level privileges would bypass this safety rail. This is the same class of bug fixed in AUTH-01 for `user-management.ts` and `users/[id]/route.ts`.
- **Concrete failure scenario**: A custom role "ultra_admin" is created with the same capabilities and level as "super_admin". The PATCH route would not prevent reducing its capabilities because the check only matches the literal string "super_admin".
- **Fix**: Import `isSuperAdminRole` from `@/lib/capabilities/cache` and replace `role.name === "super_admin"` with `isSuperAdminRole(role.name)`.

## F5: Roles PATCH route duplicates `ROLE_LEVELS` map instead of using canonical `ROLE_LEVEL` or `getRoleLevel()`
- **File**: `src/app/api/v1/admin/roles/[id]/route.ts:70`
- **Severity**: LOW | **Confidence**: High
- **Description**: Line 70 defines a local `ROLE_LEVELS` object: `{ student: 0, assistant: 0, ta: 1, instructor: 1, admin: 2, super_admin: 3 }`. This duplicates the canonical `ROLE_LEVEL` from `src/lib/security/constants.ts` (which has `student: 0, assistant: 1, instructor: 2, admin: 3, super_admin: 4`). Notably, the level values are **different** between the two maps. The canonical map has `assistant: 1` and `instructor: 2`, while the local map has `assistant: 0` and `instructor: 1`. This means the role level comparison in the PATCH route uses inconsistent values. More importantly, this hardcoded map does not support custom roles at all — custom roles would get level `-1` from `ROLE_LEVELS[user.role] ?? -1`, effectively being treated as less privileged than students.
- **Concrete failure scenario**: An admin creates a custom role "head_ta" with level 2 (between TA and instructor). The PATCH route's `ROLE_LEVELS` map doesn't include "head_ta", so it gets `-1`, meaning an admin with `head_ta` role cannot update roles that they should be able to manage based on their actual level.
- **Fix**: Replace the local `ROLE_LEVELS` map with `getRoleLevel()` from `@/lib/capabilities/cache`, which supports custom roles. Since this is an async function, the `creatorLevel` comparison at line 72 needs to be awaited. The `isSuperAdminRole` helper (or a similar approach) should be used instead of the hardcoded check.

## F6: `canManageRole`/`canManageRoleAsync` still use hardcoded `=== "super_admin"` string comparison
- **File**: `src/lib/security/constants.ts:78,87`
- **Severity**: LOW | **Confidence**: High
- **Description**: Both `canManageRole()` and `canManageRoleAsync()` check `requestedRole === "super_admin"` at lines 78 and 87. While functionally correct for built-in roles, this bypasses the capability-based approach that the `isSuperAdminRole()` helper was created for. Custom roles with super_admin-level capabilities would not be protected by this check.
- **Concrete failure scenario**: A custom role "platform_admin" is created with super_admin-level capabilities. `canManageRoleAsync("instructor", "platform_admin")` returns `true` (because the `=== "super_admin"` check fails), allowing an instructor to assign a role that should only be assignable by super_admin-equivalent roles.
- **Fix**: Replace `requestedRole === "super_admin"` with `isSuperAdminRole(requestedRole)` in both functions. For `canManageRole()` (sync), use `getBuiltinRoleLevel(requestedRole) >= (DEFAULT_ROLE_LEVELS.super_admin ?? 4)`. For `canManageRoleAsync()`, use `isSuperAdminRole(requestedRole)`.

## F7: `system-settings-config.ts` uses `select()` without column restriction on `systemSettings` table
- **File**: `src/lib/system-settings-config.ts:109-113`
- **Severity**: LOW | **Confidence**: Medium
- **Description**: `loadFromDb()` calls `db.select().from(systemSettings).where(...)` without column restriction, loading all columns from the `systemSettings` table. The function then iterates over `Object.keys(DEFAULTS)` to extract specific keys. If the `systemSettings` table has columns not in `DEFAULTS` (e.g., administrative metadata like `updatedBy`), they would be loaded unnecessarily. Additionally, the row is cast to `Record<string, unknown>` at line 117 which bypasses TypeScript's type safety.
- **Concrete failure scenario**: Minor — extra columns loaded on each settings refresh (every 60s). If the `systemSettings` table grows with audit columns, those would be loaded but never used.
- **Fix**: Either add explicit column selection for all keys in `DEFAULTS`, or keep the current approach if all columns in `systemSettings` are settings keys (verify this is the case).

## F8: `exam-sessions.ts` uses `new Date()` for deadline comparison inside transaction
- **File**: `src/lib/assignments/exam-sessions.ts:49-57`
- **Severity**: LOW | **Confidence**: Medium
- **Description**: `startExamSession()` uses `new Date()` (application server time) at lines 51 and 55 for deadline comparisons inside a database transaction. This is the same class of clock-skew concern noted in the deferred item A19. If the application server clock is behind the database clock, a user could start an exam session after the deadline has passed according to the database. The `personalDeadline` calculation at line 78 also uses `now.getTime()`, which compounds the issue.
- **Concrete failure scenario**: App server clock is 5 seconds behind DB clock. A windowed exam deadline is 12:00:00. At 12:00:03 DB time (11:59:58 app time), the user requests to start an exam. The check at line 55 passes (11:59:58 < 12:00:00), but the exam should be closed. This is LOW severity because exam sessions are typically started well before the deadline.
- **Fix**: This is already tracked as deferred item A19. The specific exam-session risk could be mitigated by using PostgreSQL `NOW()` for the comparison, but this requires restructuring the query.

---

## Summary Statistics
- Total new findings this cycle: 8
- Critical: 0
- High: 0
- Medium: 2 (F1 — uncolumned select on API key auth, F4 — hardcoded super_admin check in roles PATCH)
- Low: 6 (F2 — encryptedKey loaded for boolean check, F3 — uncolumned select on docker build, F5 — duplicated ROLE_LEVELS map, F6 — hardcoded super_admin in canManageRole, F7 — uncolumned select on system settings, F8 — clock skew in exam session)
