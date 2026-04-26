# Cycle 8 Review Remediation Plan

**Date:** 2026-04-20
**Source:** `.context/reviews/_aggregate.md` (cycle 8)

---

## Scope

This cycle addresses the new cycle-8 findings from the multi-agent review:
- AGG-1: Exam submission `submittedAt` uses `new Date()` while deadline check uses SQL `NOW()` — direct clock-skew bug
- AGG-2: Judge poll route `judgeClaimedAt` and `judgedAt` use `new Date()`
- AGG-3: Judge heartbeat uses `new Date()` for `lastHeartbeatAt` and staleness calculation
- AGG-4: Group enrollment `enrolledAt` uses inconsistent time source between invite and manual enrollment
- AGG-5: Judge deregister uses `new Date()` for `deregisteredAt`
- AGG-6: Community thread moderation timestamps use `new Date()`
- AGG-7: User creation, role creation, and other `createdAt`/`updatedAt` fields use `new Date()`
- AGG-8: Stale plan statuses in cycles 7, 24, and 25 (ALREADY FIXED in this plan creation)
- AGG-9: Prior cycle 22 AGG-1 was a false positive (INFO only, no code change)

No cycle-8 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Fix exam submission `submittedAt` clock-skew — use `getDbNowUncached()` for submission creation timestamp (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/app/api/v1/submissions/route.ts:317`
- **Problem:** The submission creation route performs exam deadline checks using SQL `NOW()` (authoritative DB time) inside a transaction, then writes `submittedAt: new Date()` using app server time. If the app server clock drifts ahead of the DB clock, a submission that passes the deadline check could have a `submittedAt` timestamp after the deadline. This directly undermines exam integrity.
- **Plan:**
  1. Import `getDbNowUncached` from `@/lib/db-time` in `src/app/api/v1/submissions/route.ts`.
  2. Replace `submittedAt: new Date()` (line 317) with `submittedAt: await getDbNowUncached()`.
  3. Verify tsc --noEmit passes.
  4. Verify existing tests pass.
- **Status:** DONE

### H2: Fix judge poll `judgeClaimedAt` and `judgedAt` clock-skew — use `getDbNowUncached()` (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/app/api/v1/judge/poll/route.ts:75,142`
- **Problem:** The judge poll route records `judgeClaimedAt: new Date()` and `judgedAt: new Date()` using app server time. These timestamps are used in submission ordering and contest result queries. The broader codebase has migrated high-priority timestamps to `getDbNowUncached()`.
- **Plan:**
  1. Import `getDbNowUncached` from `@/lib/db-time` in `src/app/api/v1/judge/poll/route.ts`.
  2. For the in-progress update (line 75): Replace `judgeClaimedAt: new Date()` with `judgeClaimedAt: await getDbNowUncached()`.
  3. For the final verdict update (line 142): Replace `judgedAt: new Date()` with `judgedAt: await getDbNowUncached()`.
  4. Verify tsc --noEmit passes.
  5. Verify existing tests pass.
- **Status:** DONE

### M1: Fix judge heartbeat `lastHeartbeatAt` and staleness calculation — use `getDbNowUncached()` (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/app/api/v1/judge/heartbeat/route.ts:39,72-82`
- **Problem:** The heartbeat route writes `lastHeartbeatAt: new Date()` and computes staleness threshold using `Date.now()`. Both use app server time, so internally consistent. However, if other code queries `lastHeartbeatAt` and compares it with DB time, the mixed time sources could cause inconsistencies.
- **Plan:**
  1. Import `getDbNowUncached` from `@/lib/db-time` in `src/app/api/v1/judge/heartbeat/route.ts`.
  2. Replace `const now = new Date()` (line 39) with `const now = await getDbNowUncached()`.
  3. Replace `Date.now() - HEARTBEAT_INTERVAL_MS * STALE_MULTIPLIER` (line 73) with `now.getTime() - HEARTBEAT_INTERVAL_MS * STALE_MULTIPLIER` (using the same DB time instance).
  4. Verify tsc --noEmit passes.
- **Status:** DONE

### M2: Fix group enrollment `enrolledAt` inconsistent time source (AGG-4)

- **Source:** AGG-4
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/app/api/v1/groups/[id]/members/route.ts:105`
- **Problem:** Manual group enrollment uses `enrolledAt: new Date()`, while the invite route uses `getDbNowUncached()`. The same `enrollments.enrolledAt` column stores timestamps from two different clocks.
- **Plan:**
  1. Import `getDbNowUncached` from `@/lib/db-time` in `src/app/api/v1/groups/[id]/members/route.ts`.
  2. Replace `enrolledAt: new Date()` (line 105) with `enrolledAt: await getDbNowUncached()`.
  3. Verify tsc --noEmit passes.
- **Status:** DONE

### M3: Fix judge deregister `deregisteredAt` clock source (AGG-5)

- **Source:** AGG-5
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/app/api/v1/judge/deregister/route.ts:50`
- **Problem:** `deregisteredAt: new Date()` uses the app server clock. Should use DB time for consistency.
- **Plan:**
  1. Import `getDbNowUncached` from `@/lib/db-time` in `src/app/api/v1/judge/deregister/route.ts`.
  2. Add `const now = await getDbNowUncached()` at the start of the handler (after auth checks).
  3. Replace `deregisteredAt: new Date()` (line 50) with `deregisteredAt: now`.
  4. Verify tsc --noEmit passes.
- **Status:** DONE

### M4: Fix community thread moderation timestamps (AGG-6)

- **Source:** AGG-6
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/app/api/v1/community/threads/[id]/route.ts:41-43`, `src/app/api/v1/community/threads/[id]/posts/route.ts:52`
- **Problem:** `lockedAt`, `pinnedAt`, `updatedAt` use `new Date()`. These are moderation timestamps with no security implications but should use DB time for consistency.
- **Plan:**
  1. Import `getDbNowUncached` from `@/lib/db-time` in `src/app/api/v1/community/threads/[id]/route.ts`.
  2. Add `const now = await getDbNowUncached()` at the start of the PATCH handler.
  3. Replace `body.locked ? new Date() : null` with `body.locked ? now : null` (line 41).
  4. Replace `body.pinned ? new Date() : null` with `body.pinned ? now : null` (line 42).
  5. Replace `updatedAt: new Date()` with `updatedAt: now` (line 43).
  6. For `src/app/api/v1/community/threads/[id]/posts/route.ts:52`: Import `getDbNowUncached` and replace `updatedAt: new Date()` with `updatedAt: await getDbNowUncached()`.
  7. Similarly update `src/app/api/v1/community/votes/route.ts:95,106` for `updatedAt: new Date()`.
  8. Verify tsc --noEmit passes.
- **Status:** TODO

### L1: Fix remaining `createdAt`/`updatedAt` fields that use `new Date()` (AGG-7)

- **Source:** AGG-7
- **Severity / confidence:** LOW / LOW
- **Citations:**
  - `src/app/api/v1/users/route.ts:126-127`
  - `src/app/api/v1/users/bulk/route.ts:126-127`
  - `src/lib/problem-sets/management.ts:85,108,164`
  - `src/app/api/v1/admin/roles/route.ts:74,97-98`
  - `src/app/api/v1/groups/route.ts:87-88`
  - `src/app/api/v1/admin/languages/route.ts:62`
  - `src/app/api/v1/admin/languages/[language]/route.ts:44`
  - `src/app/api/v1/admin/plugins/[id]/route.ts:70,101`
  - `src/app/api/v1/admin/settings/route.ts:82`
  - `src/app/api/v1/admin/api-keys/[id]/route.ts:52`
  - `src/app/api/v1/groups/[id]/assignments/[assignmentId]/overrides/route.ts:116`
  - `src/lib/capabilities/ensure-builtin-roles.ts:26-27,34`
- **Problem:** Creation and update timestamps for users, problem sets, roles, groups, languages, plugins, settings, API keys, and overrides use `new Date()`. These are write-once or update-only timestamps with no temporal comparison usage.
- **Plan:**
  1. For each file listed, import `getDbNowUncached` and replace `new Date()` with `await getDbNowUncached()`.
  2. For files that use `const now = new Date()` multiple times (e.g., `createdAt: now, updatedAt: now`), use a single `const now = await getDbNowUncached()` call.
  3. For files where the `new Date()` is inside a transaction, the `getDbNowUncached()` call should be made before the transaction to avoid holding a DB connection while awaiting.
  4. Verify tsc --noEmit passes.
- **Status:** DONE

### L2: Add test for `submittedAt` DB-time usage in exam submission flow (AGG-1, partial)

- **Source:** AGG-1 (TE-1)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `tests/unit/api/submissions.route.test.ts` (or similar)
- **Problem:** No test verifies that `submittedAt` is set using DB-sourced time in the exam submission flow.
- **Plan:**
  1. Add a test that mocks `getDbNowUncached` and verifies it is called when creating a submission during an exam.
  2. Alternatively, add a test that verifies the submission route module imports `getDbNowUncached`.
  3. Verify the test passes.
- **Status:** DEFERRED (db-time mock is in place in the test file; dedicated assertion test deferred)

---

## Deferred items

### DEFER-1: Judge heartbeat staleness sweep could be moved to a periodic background job (PERF-2)

- **Source:** PERF-2
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/app/api/v1/judge/heartbeat/route.ts:72-82`
- **Original severity preserved:** LOW / LOW
- **Reason for deferral:** The piggyback approach is simple and effective at the current scale. Moving to a background job would add infrastructure complexity (cron scheduling, health monitoring) without measurable benefit.
- **Exit criterion:** When worker count grows significantly (50+ workers) and heartbeat processing latency becomes measurable.

### DEFER-2: Judge deregister could use single UPDATE with RETURNING instead of SELECT+UPDATE (PERF-3)

- **Source:** PERF-3
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/app/api/v1/judge/deregister/route.ts:62-84`
- **Original severity preserved:** LOW / LOW
- **Reason for deferral:** The current two-query pattern is correct and the TOCTOU window is negligible (both queries run in the same request context). The performance benefit of combining them is minimal at the current scale.
- **Exit criterion:** When deregistration latency becomes a bottleneck, or when the route is refactored.

---

## Progress log

- 2026-04-20: Plan created from cycle-8 aggregate review.
- 2026-04-20: Updated stale plan statuses in cycle 7 (M3, L1), cycle 24 (M2), cycle 25 (M2).
- 2026-04-20: Archived completed cycle 24 and 25 plans.
- 2026-04-20: AGG-8 (stale plan statuses) resolved during plan creation.
- 2026-04-20: AGG-9 (cycle 22 false positive) documented as INFO — no code change needed.
- 2026-04-20: H1 DONE — `submittedAt: new Date()` replaced with `getDbNowUncached()` in submissions route.
- 2026-04-20: H2 DONE — `judgeClaimedAt` and `judgedAt` replaced with `getDbNowUncached()` in judge poll route.
- 2026-04-20: M1 DONE — Heartbeat `lastHeartbeatAt` and staleness calculation replaced with `getDbNowUncached()`.
- 2026-04-20: M2 DONE — Group enrollment `enrolledAt` and bulk enrollment `enrolledAt` replaced with `getDbNowUncached()`. Group creation timestamps also fixed.
- 2026-04-20: M3 DONE — Judge deregister `deregisteredAt` replaced with `getDbNowUncached()`.
- 2026-04-20: M4 DONE — Community thread moderation (lockedAt, pinnedAt, updatedAt), posts (updatedAt), votes (updatedAt) all replaced with `getDbNowUncached()`.
- 2026-04-20: L1 DONE — All remaining `createdAt`/`updatedAt` fields across 12+ files replaced with `getDbNowUncached()`. `withUpdatedAt()` helper updated to accept optional `now` parameter.
- 2026-04-20: Test mocks added for `@/lib/db-time` in 10 test files. All 290 tests pass.
- 2026-04-20: L2 DEFERRED — db-time mock is in place; dedicated assertion test deferred.
- 2026-04-20: All commits pushed to remote. Deploy triggered.
