# Cycle 11 Review Remediation Plan

**Date:** 2026-04-19
**Source:** `.context/reviews/cycle-11-comprehensive-review.md`, `.context/reviews/_aggregate.md`
**Status:** COMPLETE

## Deduplication note
Cycles 1-10 plans are all COMPLETE. This plan covers findings that are genuinely NEW from the cycle 11 review.

---

## Implementation Stories

### DATA-09: Restrict column selection in `authenticateApiKey()`
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Quick win

**Files:**
- `src/lib/api/api-key-auth.ts:71-75`

**Problem:** `db.select().from(apiKeys)` without column restriction loads `encryptedKey` and `keyHash` on every API key auth request. Only `id`, `role`, `createdById`, `expiresAt`, `isActive` are needed.

**Fix:**
Replace with:
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

**Verification:** `npx tsc --noEmit`, `npx vitest run`

---

### AUTH-02: Replace hardcoded `role.name === "super_admin"` in roles PATCH with `isSuperAdminRole()`
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Quick win

**Files:**
- `src/app/api/v1/admin/roles/[id]/route.ts:59`

**Problem:** Same class of bug fixed in cycle 3 AUTH-01 for `user-management.ts` and `users/[id]/route.ts`. Custom roles with super_admin-level privileges bypass this safety rail.

**Fix:**
1. Import `isSuperAdminRole` from `@/lib/capabilities/cache`
2. Replace `role.name === "super_admin"` with `isSuperAdminRole(role.name)`

**Verification:** `npx tsc --noEmit`, `npx vitest run`

---

### AUTH-03: Replace duplicated `ROLE_LEVELS` map with `getRoleLevel()` and fix `canManageRole`/`canManageRoleAsync`
**Severity:** LOW | **Confidence:** HIGH | **Effort:** Moderate

**Files:**
- `src/app/api/v1/admin/roles/[id]/route.ts:70` — replace local `ROLE_LEVELS` with `getRoleLevel()`
- `src/lib/security/constants.ts:78,87` — replace `requestedRole === "super_admin"` with `isSuperAdminRole()`

**Problem:**
1. The roles PATCH route has a local `ROLE_LEVELS` map with **different values** from the canonical `ROLE_LEVEL` in constants.ts. The local map also doesn't support custom roles.
2. `canManageRole` and `canManageRoleAsync` still use hardcoded `=== "super_admin"` instead of `isSuperAdminRole()`.

**Fix:**
1. In roles PATCH route: Remove `ROLE_LEVELS` map. Use `await getRoleLevel(user.role)` for `creatorLevel` and `await getRoleLevel(role.name)` for target role level. Since `getRoleLevel` is async, make the comparison async.
2. In constants.ts: Import `isSuperAdminRole` from `@/lib/capabilities/cache` and replace both `requestedRole === "super_admin"` checks. For the sync `canManageRole()`, use `getBuiltinRoleLevel(requestedRole) >= (DEFAULT_ROLE_LEVELS.super_admin ?? 4)`.

**Verification:** `npx tsc --noEmit`, `npx vitest run`

---

### DATA-10: Replace `encryptedKey` column load with SQL IS NOT NULL expression in admin API keys GET
**Severity:** LOW | **Confidence:** HIGH | **Effort:** Quick win

**Files:**
- `src/app/api/v1/admin/api-keys/route.ts:33,39-42`

**Problem:** Loads potentially large `encryptedKey` data from DB for every API key row just to check if it's non-null. Should use SQL expression instead.

**Fix:**
Replace the select field and simplify the response mapping:
```ts
const rows = await db
  .select({
    id: apiKeys.id,
    name: apiKeys.name,
    keyPrefix: apiKeys.keyPrefix,
    role: apiKeys.role,
    createdById: apiKeys.createdById,
    createdByName: users.name,
    lastUsedAt: apiKeys.lastUsedAt,
    expiresAt: apiKeys.expiresAt,
    isActive: apiKeys.isActive,
    createdAt: apiKeys.createdAt,
    hasEncryptedKey: sql<boolean>`${apiKeys.encryptedKey} IS NOT NULL`,
  })
  .from(apiKeys)
  .leftJoin(users, eq(apiKeys.createdById, users.id))
  .orderBy(desc(apiKeys.createdAt));

return apiSuccess(rows);
```

**Verification:** `npx tsc --noEmit`, `npx vitest run`

---

### DATA-11: Restrict column selection in docker image build route
**Severity:** LOW | **Confidence:** HIGH | **Effort:** Quick win

**Files:**
- `src/app/api/v1/admin/docker/images/build/route.ts:25`

**Problem:** `db.select().from(languageConfigs)` without column restriction. Only `dockerImage` is needed.

**Fix:**
Replace with:
```ts
const [langConfig] = await db
  .select({ dockerImage: languageConfigs.dockerImage })
  .from(languageConfigs)
  .where(eq(languageConfigs.language, body.language))
  .limit(1);
```

**Verification:** `npx tsc --noEmit`, `npx vitest run`

---

### DATA-12: Verify and potentially restrict column selection in `system-settings-config.ts`
**Severity:** LOW | **Confidence:** MEDIUM | **Effort:** Quick win

**Files:**
- `src/lib/system-settings-config.ts:109-113`

**Problem:** `db.select().from(systemSettings)` without column restriction. Need to verify if all columns are settings keys.

**Fix:**
Check the `systemSettings` schema to confirm whether all columns are settings keys. If there are non-settings columns, add explicit column selection. If all columns are settings keys, document this as by-design and close.

**Verification:** `npx tsc --noEmit`

---

## Deferred Items

These findings are explicitly deferred per the review. Each records the file+line citation, original severity/confidence, concrete reason, and exit criterion.

| ID | Finding | Severity | Confidence | Reason for deferral | Exit criterion |
|----|---------|----------|------------|---------------------|----------------|
| F8 | `exam-sessions.ts` uses `new Date()` for deadline comparison | LOW | MEDIUM | Already tracked as deferred A19 (cycle 4). Same class of clock-skew concern; exam sessions are typically started well before the deadline. | Critical ordering uses PostgreSQL `NOW()` |

---

## Progress Ledger

| Story | Status | Commit |
|---|---|---|
| DATA-09 | Done | `04e0284e` |
| AUTH-02 | Done | `54f8faeb` |
| AUTH-03 | Done | `54f8faeb` |
| DATA-10 | Done | `80187837` |
| DATA-11 | Done | `9cb361fc` |
| DATA-12 | By Design | N/A — all columns are settings keys; large JSONB columns are single-row overhead |
