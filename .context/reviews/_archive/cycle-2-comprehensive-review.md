# Cycle 2 Comprehensive Code Review

**Date:** 2026-04-19
**Reviewer:** General-purpose agent (multi-angle: code quality, security, performance, architecture, test gaps, i18n, UI/UX)
**Scope:** Full repository diff from cycle 1 remediation + fresh sweep of key areas

## Prior cycle status

Cycle 1 remediation (`plans/open/2026-04-19-cycle-1-review-remediation.md`) is **COMPLETE**:
- SEC-01 (timing leak): Fixed (`1b7af7b9`)
- LOGIC-02 (apiKeys select): Fixed (`7a5e8fa7`)
- ARCH-01 (fire-and-forget error handler): Fixed (`ce53912c`)
- ARCH-03 (console.warn -> logger): Fixed (`5043452d`)
- PERF-01 (batched DELETE): Fixed (`05f2ae9d`)
- LOGIC-01 (dead claimValid code): Fixed (`06c88695`)
- DOCS-01 (obsolete better-sqlite3): Fixed (`9acf6bba`)

The 2026-04-19 current-head review findings (C1-C14, L1, R1) have also been addressed in recent commits:
- C1 (assistant users.view): Fixed (`b0ee482c`)
- C2 (profile className server enforcement): Fixed (`8618bb6a`)
- C3 (profile role labels): Fixed (`8618bb6a`)
- C4 (health endpoint ordering): Fixed (`ac43cb44`)
- C5 (AdminDashboard health gating): Fixed (`ac43cb44`)
- C6 (bulk user creation partial success): Fixed (`fce350e4`)
- C7 (sidecar auth tokens in compose): Fixed (`6159c0dd`)
- C8 (RUNNER_AUTH_TOKEN in worker compose): Fixed (`6159c0dd`)
- C9 (isAdmin() doc comment): Fixed (`df71defa`)
- C11 (tsc --noEmit): Fixed (multiple commits)
- C12 (bulk user test harness): Fixed (`900da0bb`)
- C13 (compiler test permissions): Fixed (`89f3bbe5`)
- C14 (source-grep baseline): Fixed (`4b6630b2`)

## Verification evidence

- `npx tsc --noEmit` PASSES (zero errors)
- `npx vitest run` has 4 failing test files / 7 failing tests:
  - `tests/unit/api-key-auth.test.ts` (2 failures)
  - `tests/unit/data-retention-maintenance.test.ts` (2 failures)
  - `tests/unit/audit/events.test.ts` (2 failures)
  - `tests/unit/infra/source-grep-inventory.test.ts` (1 failure)

---

## NEW FINDINGS (not found or not fully addressed in prior cycles)

### F1: Missing i18n key `contests.antiCheat.language` in both locale bundles
**Severity:** MEDIUM | **Confidence:** HIGH | **Category:** i18n / UI

**Files / regions**
- `src/components/contest/anti-cheat-dashboard.tsx:307` — renders `t("language")`
- `messages/en.json:2058-2079` — `contests.antiCheat` section has no `language` key
- `messages/ko.json:2058-2079` — `contests.antiCheat` section has no `language` key

**Why this is a problem**
The anti-cheat dashboard's flagged-pairs table header renders `t("language")` using the `contests.antiCheat` namespace, but neither the English nor Korean locale bundles define this key. This was reported as C10 in the 2026-04-19 review but was NOT addressed in the remediation commits.

**Concrete failure scenario**
The anti-cheat dashboard renders a raw key like `contests.antiCheat.language` or a missing-translation placeholder instead of "Language" / "언어" in the flagged pairs table.

**Fix**
Add `"language": "Language"` under `contests.antiCheat` in `messages/en.json` and `"language": "언어"` in `messages/ko.json`.

---

### F2: CSRF-before-auth ordering on 6 unwrapped API routes blocks API-key callers
**Severity:** MEDIUM | **Confidence:** HIGH | **Category:** Security / API compatibility

**Files / regions**
- `src/app/api/v1/groups/[id]/assignments/route.ts:79` — CSRF before auth
- `src/app/api/v1/admin/backup/route.ts:21` — CSRF before auth
- `src/app/api/v1/admin/restore/route.ts:21` — CSRF before auth
- `src/app/api/v1/admin/migrate/export/route.ts:17` — CSRF before auth
- `src/app/api/v1/admin/migrate/validate/route.ts:12` — CSRF before auth
- `src/app/api/v1/admin/migrate/import/route.ts:19` — CSRF before auth

**Why this is a problem**
These routes check `csrfForbidden(request)` BEFORE resolving `getApiUser(request)`. The files DELETE route was already fixed in a prior cycle to resolve auth first and then conditionally skip CSRF for API-key callers (`_apiKeyAuth`). These 6 routes still have the old ordering, meaning API-key-authenticated callers (who send no cookies and no browser-origin headers) will be rejected by CSRF before their identity is even checked.

The `files/route.ts` POST handler (line 30) also checks CSRF before auth, but it does have the API-key bypass right after. However, the order is still suboptimal — it resolves auth, then checks CSRF only for non-API-key users. The assignments and admin routes don't have the bypass at all.

**Concrete failure scenario**
An automation tool using a Bearer API key tries to create an assignment or trigger a database export. The CSRF check rejects the request because there's no `X-Requested-With` header or valid origin, even though API key auth is inherently not vulnerable to CSRF.

**Fix**
For each of these routes, reorder to resolve auth first, then skip CSRF for API-key callers (following the pattern in `files/[id]/route.ts:123-139`):
```
const user = await getApiUser(request);
if (!user) return unauthorized();
const isApiKeyAuth = "_apiKeyAuth" in user;
if (!isApiKeyAuth) {
  const csrfError = csrfForbidden(request);
  if (csrfError) return csrfError;
}
```

---

### F3: `tests/unit/api-key-auth.test.ts` — mock chain does not match the actual `db.select().from().where().limit()` call chain
**Severity:** MEDIUM | **Confidence:** HIGH | **Category:** Test correctness

**Files / regions**
- `tests/unit/api-key-auth.test.ts:8-19` — `makeSelectChain` mock
- `src/lib/api/api-key-auth.ts:71-74` — actual `db.select().from(apiKeys).where(...).limit(1)` call

**Why this is a problem**
The test's `makeSelectChain` creates a chain with `from`, `where`, `limit`, and `then` methods. The actual code calls `db.select().from(apiKeys).where(and(...)).limit(1)`. The mock's `limit` method returns the rows array directly instead of a chainable that also has `.then()`. While `then` is mocked, the ordering of the chain means `limit()` is called last and must return a thenable. The mock works for simple cases but fails for the `authenticateApiKey` flow because the second `db.select()` (for the user) re-uses the same mock structure but the test doesn't properly simulate two separate select chains with `then` resolving differently.

The two failing tests ("authenticates using the stored key hash" and "uses custom-role levels") both call `authenticateApiKey()` which does two `db.select()` calls. The mock returns rows but the `then` resolution is broken because `limit()` returns the raw rows array instead of a chainable thenable.

**Concrete failure scenario**
The API key auth tests report failures, masking whether the actual `authenticateApiKey` implementation works correctly. The test harness itself is the problem, not the implementation.

**Fix**
Fix `makeSelectChain` so that `limit()` returns the chain object (which has `.then()`), and ensure `.then()` resolves with the rows. Alternatively, restructure the mock so each `db.select()` call returns a fully chainable mock that properly resolves.

---

### F4: `tests/unit/data-retention-maintenance.test.ts` — mock count expects 4 calls but loginEvents was added
**Severity:** MEDIUM | **Confidence:** HIGH | **Category:** Test correctness

**Files / regions**
- `tests/unit/data-retention-maintenance.test.ts:68` — expects `toHaveBeenCalledTimes(4)`
- `tests/unit/data-retention-maintenance.test.ts:81` — expects `toBe(8)` (2 initial passes x 4)
- `src/lib/data-retention-maintenance.ts:80-94` — now calls 5 prune functions (added `pruneLoginEvents`)

**Why this is a problem**
The test expects 4 DB delete calls per prune pass, but `pruneSensitiveOperationalData()` now calls 5 prune functions: `pruneChatMessages`, `pruneAntiCheatEvents`, `pruneRecruitingInvitations`, `pruneSubmissions`, and `pruneLoginEvents` (added in cycle 1 as part of CRIT-7). The test was not updated after `pruneLoginEvents` was added.

**Concrete failure scenario**
The test suite fails on every run because the actual prune pass makes 5 delete calls, not 4. This creates noise and reduces trust in CI.

**Fix**
Update the expected call counts: line 68 should expect 5 calls, and line 81 should expect 10 (2 initial passes x 5). Also update the second test's interval check from `initialPruneCalls + 4` to `initialPruneCalls + 5`.

---

### F5: `tests/unit/audit/events.test.ts` — prune test expects 2 delete calls but batched prune uses raw SQL
**Severity:** MEDIUM | **Confidence:** HIGH | **Category:** Test correctness

**Files / regions**
- `tests/unit/audit/events.test.ts:303,325` — expects `dbDeleteWhere` calls
- `src/lib/audit/events.ts:186-199` — uses `db.execute(sql\`DELETE ... LIMIT\`)` instead of `db.delete().where()`

**Why this is a problem**
After the PERF-01 fix (batched DELETE), the audit event pruning was changed from `db.delete(auditEvents).where(...)` to `db.execute(sql\`DELETE FROM ... LIMIT ...\`)`. The test still mocks `db.delete().where()`, but the implementation no longer calls that path. The mock's `dbDeleteWhere` is never invoked.

**Concrete failure scenario**
The test reports that `dbDeleteWhere` was called 0 times instead of the expected 2, causing a test failure.

**Fix**
Update the test to mock `db.execute()` instead of `db.delete().where()`, matching the current batched-delete implementation.

---

### F6: `tests/unit/infra/source-grep-inventory.test.ts` — baseline is stale again (115 vs 118)
**Severity:** LOW | **Confidence:** HIGH | **Category:** Test maintenance

**Files / regions**
- `tests/unit/infra/source-grep-inventory.test.ts:85-86` — `DOCUMENTED_BASELINE = 115`

**Why this is a problem**
This was reported as C14 in the prior review and was fixed once (`4b6630b2` updated to 115), but 3 new test files have been added since then, making the current count 118. This test will continue to drift every time a test file is added.

**Concrete failure scenario**
The test fails on every run after test files are added, reducing CI trust.

**Fix**
Update `DOCUMENTED_BASELINE` to 118. Consider making this test more resilient by not requiring an exact count, or by auto-computing the baseline from the file system.

---

### F7: `role !== "student"` check in groups members POST route excludes custom non-student roles from enrollment
**Severity:** MEDIUM | **Confidence:** MEDIUM | **Category:** Logic / Capability consistency

**Files / regions**
- `src/app/api/v1/groups/[id]/members/route.ts:94` — `if (student.role !== "student")`
- `src/app/(dashboard)/dashboard/groups/[id]/page.tsx:201` — `u.role !== "student" && u.id !== group.instructorId`
- `src/app/(dashboard)/dashboard/groups/page.tsx:87` — `user.role !== "student"`

**Why this is a problem**
The members POST route hardcodes `student.role !== "student"` to prevent non-students from being enrolled. This blocks custom roles (e.g., `teaching_assistant`) that should be enrollable as students. Similarly, the groups page UI filters non-student users for instructor selection, which is reasonable, but also uses hardcoded role comparison rather than capability-based checks.

The system has a capability model (`ASSISTANT_CAPABILITIES`, custom roles) but these API routes don't use it. A custom role that has student-level privileges would be rejected from group enrollment.

**Concrete failure scenario**
A custom "teaching_assistant" role that has student-equivalent capabilities cannot be enrolled in a group via the API, even though the intent is for them to participate as students in that group context.

**Fix**
Replace `student.role !== "student"` with a capability-based check: use `getRoleLevel(role) <= 0` (or check for `content.submit_solutions` capability without `users.view` or higher) to determine if a role should be enrollable as a student. The UI filters should also use `getRoleLevel` rather than raw string comparison.

---

### F8: `/api/metrics` computes full admin health snapshot even when only CRON_SECRET auth is used
**Severity:** LOW | **Confidence:** HIGH | **Category:** Performance

**Files / regions**
- `src/app/api/metrics/route.ts:39` — `const snapshot = await getAdminHealthSnapshot()`

**Why this is a problem**
This is a minor variant of the already-fixed C4/C5 issues. The `/api/metrics` route now correctly gates access (capability or CRON_SECRET), but once authorized, it always computes the full admin health snapshot. For CRON_SECRET-only callers (Prometheus scrapers), the metrics route only needs the worker/queue counts, not the full audit-health snapshot. The audit-health snapshot call is cheap (in-memory counter read), but it still queries the DB twice (worker count + submission queue count) plus a raw `select 1` probe.

This is LOW severity because the data is needed for the Prometheus metrics format. However, the `getAdminHealthSnapshot()` function does 3 DB queries (raw `select 1`, worker stats, queue stats), and the metrics route formats only the worker/queue data. The `select 1` probe is redundant for metrics since the subsequent queries already prove DB connectivity.

**Concrete failure scenario**
A Prometheus scraper polls `/api/metrics` every 15 seconds, triggering 3 DB queries per poll when only 2 are needed.

**Fix**
Consider a lighter `getMetricsSnapshot()` that skips the `select 1` liveness probe, since the worker/queue queries already confirm DB connectivity. Or accept the minor overhead as negligible.

---

### F9: SSE connection tracking Map grows without eviction for tracked connections beyond MAX_TRACKED_CONNECTIONS
**Severity:** LOW | **Confidence:** HIGH | **Category:** Resource management

**Files / regions**
- `src/app/api/v1/submissions/[id]/events/route.ts:46-55` — `addConnection` function
- `src/app/api/v1/submissions/[id]/events/route.ts:62-77` — cleanup interval

**Why this is a problem**
The `addConnection` function evicts the oldest entry when `connectionInfoMap.size >= MAX_TRACKED_CONNECTIONS` (1000), but it does NOT remove the corresponding entry from `activeConnectionSet`. The `removeConnection` helper (which removes from both) is only called during eviction if the oldest entry exists. However, the `activeConnectionSet` can still contain stale connection IDs that were evicted from the `connectionInfoMap` but never removed from the set. Over time, the `activeConnectionSet` could accumulate stale entries.

Looking more carefully, the eviction code at line 49-51 DOES call `removeConnection(oldest)` which removes from both the set and the map. So the eviction path is correct. However, the in-memory `activeConnectionSet` and `connectionInfoMap` are process-local, meaning in a multi-pod deployment, connection limits are per-pod rather than global. The code already supports shared coordination via Redis (`acquireSharedSseConnectionSlot`) for deployments that enable it.

This is LOW severity because the stale-entry cleanup interval (line 68-77) runs every 60 seconds and removes entries older than the threshold. The per-pod limitation is by design when shared coordination is disabled.

**Fix**
No fix needed for the stale entry issue (already handled by cleanup interval). Document the per-pod limitation for deployments without shared coordination.

---

### F10: Groups page fetches ALL users for instructor dropdown regardless of group membership scope
**Severity:** LOW | **Confidence:** MEDIUM | **Category:** Information exposure / Performance

**Files / regions**
- `src/app/(dashboard)/dashboard/groups/page.tsx:83-88` — fetches all active users, then filters non-students
- `src/app/(dashboard)/dashboard/groups/[id]/page.tsx:197-202` — fetches all active users, then filters non-students

**Why this is a problem**
Both pages query ALL active users from the database and then filter client-side for non-student users to populate instructor dropdowns. On a platform with thousands of users, this means:
1. Fetching potentially large user lists from the DB
2. Exposing usernames/names of all users to any instructor who can edit groups

This is a data-minimization concern: the instructor dropdown should only show users who are eligible to be instructors, not all users. At minimum, the DB query should filter by role server-side rather than fetching all users and filtering client-side.

**Concrete failure scenario**
A platform with 50,000 users fetches all 50,000 records on the groups page, even though only a few hundred are eligible instructors. This causes slow page loads and unnecessary data exposure.

**Fix**
Add a server-side filter: query users where `role != 'student'` (or `getRoleLevel >= instructor level`) instead of fetching all users and filtering in JavaScript.

---

## POSITIVE OBSERVATIONS (cycle 2)

1. **All prior CRITICAL/HIGH findings have been remediated.** The timing leak (SEC-01), sidecar auth wiring (C7/C8), profile className enforcement (C2), health endpoint ordering (C4/C5), and isAdmin() documentation (C9) are all fixed.

2. **`tsc --noEmit` now passes cleanly**, which means the TypeScript quality gate is green for the first time since the prior review cycle.

3. **The capability model is consistently applied** in most new code. Routes that were migrated to `createApiHandler` correctly use `resolveCapabilities()` for authorization.

4. **Batched DELETE** is properly implemented in both `data-retention-maintenance.ts` and `audit/events.ts`, following the `LIMIT ${BATCH_SIZE}` pattern with delay between batches.

5. **The `safeTokenCompare()` utility** is now consistently used in judge routes (heartbeat, deregister) instead of raw `timingSafeEqual`.

6. **The files DELETE route** correctly orders auth before CSRF and skips CSRF for API-key callers.

---

## SUMMARY TABLE

| ID | Severity | Category | File(s) | Confidence |
|----|----------|----------|---------|------------|
| F1 | MEDIUM | i18n | anti-cheat-dashboard.tsx, messages/*.json | HIGH |
| F2 | MEDIUM | Security / API compat | 6 routes with CSRF-before-auth | HIGH |
| F3 | MEDIUM | Test correctness | api-key-auth.test.ts | HIGH |
| F4 | MEDIUM | Test correctness | data-retention-maintenance.test.ts | HIGH |
| F5 | MEDIUM | Test correctness | audit/events.test.ts | HIGH |
| F6 | LOW | Test maintenance | source-grep-inventory.test.ts | HIGH |
| F7 | MEDIUM | Logic / Capabilities | groups/[id]/members/route.ts, groups pages | MEDIUM |
| F8 | LOW | Performance | metrics/route.ts | HIGH |
| F9 | LOW | Resource mgmt | submissions/[id]/events/route.ts | HIGH |
| F10 | LOW | Info exposure / Perf | groups pages | MEDIUM |
