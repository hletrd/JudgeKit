# Cycle 6b Review Remediation Plan

**Date:** 2026-04-19
**Source:** `.context/reviews/cycle-6b-code-reviewer.md`, `.context/reviews/cycle-6b-security-reviewer.md`, `.context/reviews/cycle-6b-perf-reviewer.md`, `.context/reviews/cycle-6b-architect.md`, `.context/reviews/cycle-6b-test-engineer.md`, `.context/reviews/cycle-6b-debugger.md`, `.context/reviews/cycle-6b-verifier.md`, `.context/reviews/_aggregate.md`
**Status:** IN PROGRESS

## Deduplication note
Cycles 1-6 and 5b/rpf-5 plans are all COMPLETE. This plan covers findings that are genuinely NEW from the cycle 6b deep review.

---

## Implementation Stories

### COUNT-01: Fix `countResult.count` missing `Number()` wrapper in files GET route
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Quick win

**Files:**
- `src/app/api/v1/files/route.ts:188`

**Problem:** `countResult.count` from `sql<number>\`count(*)\`` can be returned as a string by Drizzle/PG. The users route and groups/assignments route correctly wrap with `Number()`. The files route passes it raw to `apiPaginated(rows, page, limit, countResult.count)`, potentially causing the `total` field in the API response to be a string instead of a number.

**Fix:**
Change line 188 from:
```ts
return apiPaginated(rows, page, limit, countResult.count);
```
to:
```ts
return apiPaginated(rows, page, limit, Number(countResult.count));
```

**Verification:** `npx tsc --noEmit`, `npx vitest run`

---

### PROXY-01: Add `/users/:path*` and `/problem-sets/:path*` to proxy matcher
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Quick win

**Files:**
- `src/proxy.ts:306-324`

**Problem:** The middleware matcher does not include `/users/:path*` or `/problem-sets/:path*`. Public pages at these routes skip all middleware processing — no CSP headers, no nonce injection, no locale resolution.

**Fix:**
Add to `config.matcher`:
```ts
"/users/:path*",
"/problem-sets/:path*",
```

**Verification:** `npx tsc --noEmit`, `npx vitest run`, verify `/users/test-id` and `/problem-sets` pages load with CSP headers

---

### COUNT-02: Convert submissions offset pagination to COUNT(*) OVER()
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Moderate

**Files:**
- `src/app/api/v1/submissions/route.ts:111-159`

**Problem:** The offset-based pagination path issues separate `count(*)` and data queries. Under concurrent writes, the count and data can be inconsistent. The same pattern was fixed for rankings (RANK-01), chat-logs (CHAT-LOG-01), and admin chat-logs in prior cycles.

**Fix:**
1. Replace the separate count query and data query with a single query using `COUNT(*) OVER()` window function
2. Extract `total` from the first row of the result set
3. Keep the `includeSummary` path separate (it needs its own aggregation)

**Verification:** `npx tsc --noEmit`, `npx vitest run`

---

### COUNT-03: Convert files, users, groups/assignments routes to COUNT(*) OVER()
**Severity:** LOW | **Confidence:** HIGH | **Effort:** Moderate

**Files:**
- `src/app/api/v1/files/route.ts:162-186`
- `src/app/api/v1/users/route.ts:38-51`
- `src/app/api/v1/groups/[id]/assignments/route.ts:45-67`

**Problem:** Same dual-query pattern as COUNT-02. Lower-traffic routes so lower severity.

**Fix:** Same approach as COUNT-02 — use `COUNT(*) OVER()` window function.

**Verification:** `npx tsc --noEmit`, `npx vitest run`

---

### HANDLER-01: Migrate tags route to createApiHandler
**Severity:** LOW | **Confidence:** HIGH | **Effort:** Quick win

**Files:**
- `src/app/api/v1/tags/route.ts`

**Problem:** Tags route uses manual `getApiUser` pattern with no rate limiting. Migrating to `createApiHandler` adds consistent auth, CSRF, and error handling.

**Fix:**
```ts
export const GET = createApiHandler({
  handler: async (req, { user }) => {
    // existing logic
  },
});
```

**Verification:** `npx tsc --noEmit`, `npx vitest run`

---

### TEST-01: Add route-level tests for tags endpoint
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Moderate

**Files:**
- NEW: `tests/unit/api/tags-route.test.ts`

**Problem:** Tags route had a LIKE escaping bug with no test coverage. While a unit test for `escapeLikePattern` was added (TEST-08 in cycle 5), there is still no route-level test.

**Fix:** Add tests for:
- Auth required (unauthorized returns 401)
- Search with `q` parameter returns filtered results
- Empty query returns all tags
- Limit parameter works
- LIKE escaping is correct (search for `%` doesn't match all)

**Verification:** `npx vitest run tests/unit/api/tags-route.test.ts`

---

### TEST-02: Add tests for PublicHeader dropdown role-based rendering
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Moderate

**Note:** This was identified as M5 in the rpf-cycle-5 plan and is still TODO.

**Files:**
- NEW: `tests/unit/components/public-header-dropdown.test.tsx`

**Fix:** Add component tests for `getDropdownItems` with different roles (student, instructor, admin). Test desktop dropdown and mobile menu rendering.

**Verification:** `npx vitest run tests/unit/components/public-header-dropdown.test.tsx`

---

## Deferred Items

These findings are explicitly deferred per the review. Each records the file+line citation, original severity/confidence, concrete reason, and exit criterion.

| ID | Finding | Severity | Confidence | Reason for deferral | Exit criterion |
|----|---------|----------|------------|---------------------|----------------|
| AGG-4 | 12 API routes bypass createApiHandler | LOW | HIGH | Large refactor scope; routes are functional and secure. Admin backup/restore/migrate routes use formData which needs special handling. SSE and file-upload routes have legitimate reasons for manual handling. | All routes are migrated to `createApiHandler` or documented as exceptions |
| ARCH-A2 | PublicHeader loggedInUser.role typed as string | LOW | MEDIUM | String comparisons work correctly; no runtime bug. Refactoring to UserRole type is a type-safety improvement. | PublicHeader is refactored for the workspace-to-public migration Phase 3 |
| ARCH-A4 | Contest export uses raw SQL alongside Drizzle | LOW | HIGH | Style inconsistency only; raw queries work correctly and are well-structured. | Drizzle ORM gains better raw query support or contest scoring is refactored |
| ARCH-A5 | CSV export pattern duplicated across 3 routes | LOW | HIGH | DRY improvement only; each route has slight variations in headers/format. | CSV export becomes a shared utility |
| PERF-P5 | SSE cleanup timer runs with no connections | LOW | LOW | Empty-map iteration is negligible cost; unref() allows process exit. | SSE connection management is refactored |
| PERF-P6 | Submissions summary third query | LOW | HIGH | Optimization opportunity; current behavior is correct. | Submissions list performance becomes a bottleneck |
| DEBUG-D2 | Redundant String() in group export | LOW | HIGH | Cosmetic only; functionally correct. | Group assignment export is refactored |
| SEC-S5 | new Date() clock skew risk | LOW | MEDIUM | Only affects distributed deployments with unsynchronized clocks. Deferred in prior cycles. | Critical ordering uses PostgreSQL `now()` |
| TEST-T3 | No tests for groups/[id]/assignments route | MEDIUM | MEDIUM | Route works correctly; test gap is not blocking. | Route is migrated to createApiHandler |
| TEST-T5 | No tests for users GET with role filter | LOW | MEDIUM | Admin-only route with lower risk. | Users route is refactored |
| TEST-T6 | No route-level tests for admin backup/restore/migrate | MEDIUM | HIGH | Destructive admin endpoints; test gap is notable but routes have password re-confirmation. | Admin endpoints are migrated to createApiHandler |

---

## Progress Ledger

| Story | Status | Commit |
|---|---|---|
| COUNT-01 | Done | `fb67acc8` |
| PROXY-01 | Done | `fb67acc8` |
| COUNT-02 | Done | `fb67acc8` |
| COUNT-03 | Partial (submissions, files, users done; groups/assignments deferred — uses relational query API with `with` clause) | `fb67acc8` |
| HANDLER-01 | Done | `fb67acc8` |
| TEST-01 | Done | `37fabda0` |
| TEST-02 | Done | `37fabda0` |
