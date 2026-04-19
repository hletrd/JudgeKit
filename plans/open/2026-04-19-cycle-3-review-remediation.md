# Cycle 3 Review Remediation Plan

**Date:** 2026-04-19  
**Source:** `.context/reviews/cycle-3-comprehensive-review.md`, `.context/reviews/_aggregate.md`  
**Status:** COMPLETE

## Deduplication note
Cycle 1 and Cycle 2 plans are both COMPLETE. This plan covers findings that are genuinely NEW from the cycle 3 review.

---

## Implementation Stories

### LOG-01: Replace `console.log`/`console.error` with `logger` in sync-language-configs
**Severity:** LOW | **Confidence:** HIGH | **Effort:** Quick win

**Files:**
- `src/lib/judge/sync-language-configs.ts:58` — `console.log(...)` → `logger.info(...)`
- `src/lib/judge/sync-language-configs.ts:61` — `console.log(...)` → `logger.info(...)`
- `src/lib/judge/sync-language-configs.ts:77` — `console.error(...)` → `logger.error(...)`

**Problem:** Server-side code uses `console.log`/`console.error` instead of pino `logger`. Output bypasses structured logging and is not captured by log aggregation.

**Fix:** Import `logger` from `@/lib/logger` and replace all `console.*` calls.

**Verification:** `npx tsc --noEmit`, `npx vitest run`

---

### DATA-01: Restrict column selection in group DELETE handler
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Quick win

**File:**
- `src/app/api/v1/groups/[id]/route.ts:173`

**Problem:** `tx.select().from(groups)` returns all columns from the groups table. Only `id`, `name`, and `isArchived` are needed for the audit log and existence check.

**Fix:** Replace with:
```ts
const [group] = await tx.select({
  id: groups.id,
  name: groups.name,
  isArchived: groups.isArchived,
}).from(groups).where(eq(groups.id, id)).for("update").limit(1);
```

**Verification:** `npx tsc --noEmit`, `npx vitest run`

---

### AUTH-01: Replace hardcoded `super_admin` string comparisons with capability-based check
**Severity:** MEDIUM | **Confidence:** MEDIUM | **Effort:** Moderate

**Files:**
- `src/app/api/v1/users/[id]/route.ts:157` — `found.role === "super_admin"`
- `src/app/api/v1/users/[id]/route.ts:418` — `found.role === "super_admin"`
- `src/lib/actions/user-management.ts:90` — `targetUser.role === "super_admin"`
- `src/lib/actions/user-management.ts:172` — `targetUser.role === "super_admin"`

**Problem:** Hardcoded string comparison for `super_admin` is inconsistent with the capability model. Custom roles with equivalent privileges would bypass these safety rails.

**Fix:** Add a helper `isSuperAdminRole(role)` in `src/lib/capabilities/cache.ts` that uses `getRoleLevel(role) >= SUPER_ADMIN_LEVEL` (where SUPER_ADMIN_LEVEL is the highest role level, e.g., 100). Replace all `=== "super_admin"` checks with this helper. This ensures custom roles with super_admin-level capabilities are also protected.

The helper should be:
```ts
const SUPER_ADMIN_LEVEL = 100; // or whatever getRoleLevel returns for super_admin

export function isSuperAdminRole(role: string): boolean {
  return getRoleLevel(role) >= SUPER_ADMIN_LEVEL;
}
```

**Verification:** `npx tsc --noEmit`, `npx vitest run`

---

### LOGIC-01: Replace `role === "student"` in groups PATCH route with `getRoleLevel`
**Severity:** LOW | **Confidence:** HIGH | **Effort:** Quick win

**File:**
- `src/app/api/v1/groups/[id]/route.ts:135`

**Problem:** Same pattern as cycle 2 F7 (fixed in members route) but in the PATCH handler for group updates. Hardcoded `role === "student"` blocks custom roles from being assigned as instructors.

**Fix:** Replace `nextInstructor.role === "student"` with `(await getRoleLevel(nextInstructor.role)) <= 0`.

**Verification:** `npx tsc --noEmit`, `npx vitest run`

---

### TEST-01: Add test coverage for `src/lib/judge/ip-allowlist.ts`
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Moderate

**Files:**
- New file: `tests/unit/judge/ip-allowlist.test.ts`
- Source: `src/lib/judge/ip-allowlist.ts`

**Problem:** Security-critical CIDR matching logic has no tests. Edge cases (e.g., /0 prefix, invalid octets, IPv6) could have subtle bugs.

**Fix:** Add unit tests covering:
- Exact IP match
- /24, /16, /32 CIDR matching
- /0 prefix (match all)
- Invalid octets (returns false)
- IPv6 exact match (currently unsupported, returns false for CIDR)
- Empty allowlist (allows all in dev, denies in production)
- `isJudgeIpAllowed()` with mocked request headers
- Cache invalidation via `resetIpAllowlistCache()`

**Verification:** `npx vitest run tests/unit/judge/ip-allowlist.test.ts`

---

### VALID-01: Add validation for `AUTH_CACHE_TTL_MS` env var
**Severity:** LOW | **Confidence:** MEDIUM | **Effort:** Quick win

**File:**
- `src/proxy.ts:24`

**Problem:** `parseInt(process.env.AUTH_CACHE_TTL_MS ?? '2000', 10)` produces NaN or negative values for invalid inputs, which would effectively disable the auth cache.

**Fix:**
```ts
const parsedTtl = parseInt(process.env.AUTH_CACHE_TTL_MS ?? '2000', 10);
const AUTH_CACHE_TTL_MS = Number.isFinite(parsedTtl) && parsedTtl > 0 ? parsedTtl : 2000;
```

**Verification:** `npx tsc --noEmit`

---

### VALID-02: Add Zod validation for user DELETE permanent path body
**Severity:** LOW | **Confidence:** HIGH | **Effort:** Quick win

**File:**
- `src/app/api/v1/users/[id]/route.ts:432-434`

**Problem:** `body = await req.json()` parses body without Zod validation. If `confirmUsername` is not a string, `toLowerCase()` would throw.

**Fix:** Add a small Zod schema before the comparison:
```ts
const confirmSchema = z.object({ confirmUsername: z.string().min(1) });
const parsed = confirmSchema.safeParse(body);
if (!parsed.success) return apiError("confirmUsernameRequired", 400);
if (parsed.data.confirmUsername.toLowerCase() !== found.username.toLowerCase()) {
  return apiError("confirmUsernameRequired", 400);
}
```

**Verification:** `npx tsc --noEmit`, `npx vitest run`

---

## Deferred Items

These findings are explicitly deferred per the review. Each records the file+line citation, original severity/confidence, concrete reason, and exit criterion.

| ID | Finding | Severity | Confidence | Reason for deferral | Exit criterion |
|----|---------|----------|------------|---------------------|----------------|
| OBS-01 | Error boundary pages use `console.error` instead of server-side reporting | LOW | HIGH | Client-side React error boundaries conventionally use `console.error`. Adding a server-side error reporting hook is a feature request, not a bug fix. The parent `dashboard/error.tsx` does not log at all which is acceptable for client components. | Client-side error monitoring service is adopted (e.g., Sentry) |
| OPS-01 | No rate limiting on `/api/v1/health` and `/api/v1/judge/register` | LOW | HIGH | `/api/v1/health` is behind auth and returns different data for authenticated users. Judge register is behind IP allowlist and worker secret. The risk of abuse is low given existing protections. | Performance profiling shows these endpoints are being abused |
| N/A | F8 `compiler-client.tsx` hardcoded `console.log` in sample template | N/A | HIGH | By design — sample code template for users. Not application code. | N/A |

---

## Progress Ledger

| Story | Status | Commit |
|---|---|---|
| LOG-01 | Done | `66c8e9b2` |
| DATA-01 | Done | `56fc0d00` |
| AUTH-01 | Done | `5119f49c` |
| LOGIC-01 | Done | `56fc0d00` (included in DATA-01 commit) |
| TEST-01 | Done | `895286b3` |
| VALID-01 | Done | `53359b03` |
| VALID-02 | Done | `5119f49c` (included in AUTH-01 commit) |
