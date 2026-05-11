# Aggregate Review — Cycle 6

**Date:** 2026-05-11
**Reviewers:** code-reviewer, security-reviewer, perf-reviewer, architect, test-engineer
**Scope:** JudgeKit codebase with focus on SSE events, judge/poll, compiler/run, restore, anti-cheat, audit-logs

---

## New Findings Summary (This Cycle)

| Severity | Count |
|----------|-------|
| MEDIUM   | 4     |
| LOW      | 10    |
| **Total**| **14** |

---

## MEDIUM

### M1: SSE `sharedPollTick` Unbounded `inArray` Query
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:224-232`
- **Reviewers:** perf-reviewer (primary), code-reviewer
- **Confidence:** High
- **Description:** The shared poll tick collects ALL active submission IDs from `submissionSubscribers` and queries them in a single `inArray(submissions.id, submissionIds)` query. With 500 concurrent SSE connections, this creates an IN clause with 500 IDs. PostgreSQL performance degrades with large IN lists, and the query plan may switch to a suboptimal nested loop.
- **Fix:** Query by status (`WHERE status IN ('pending', 'queued', 'judging')`) with a reasonable LIMIT instead of by ID list. Or batch the ID list into chunks of 100.

### M2: `stopSharedPollTimer` Race with In-Progress `sharedPollTick`
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:161-166`
- **Reviewers:** code-reviewer (primary), perf-reviewer
- **Confidence:** Medium
- **Description:** `stopSharedPollTimer()` clears the interval timer but does not wait for an in-flight `sharedPollTick()` promise to complete. During graceful shutdown, if `stopSharedPollTimer` is called while `sharedPollTick` is awaiting its DB query, the DB connection may be released mid-query or the process may exit before the query completes.
- **Fix:** Track the active poll promise and await it in `stopSharedPollTimer` before returning.

### M3: Compiler Route `assignmentId` Accepted Without Immediate Ownership Check
- **File:** `src/app/api/v1/compiler/run/route.ts:25,33-35`
- **Reviewer:** security-reviewer
- **Confidence:** Medium
- **Description:** The compiler run route accepts `assignmentId` from the client body and passes it to `resolvePlatformModeAssignmentContextDetails`. While downstream validation exists, the route does not immediately verify that the user is enrolled in or has access to the specified assignment. A malicious user could probe different `assignmentId` values to enumerate active assignments.
- **Fix:** Validate assignment access explicitly before processing the compiler request.

### M4: `rateLimits` Table Overloaded for Three Different Concerns
- **File:** `src/lib/realtime/realtime-coordination.ts`
- **Reviewer:** architect
- **Confidence:** High
- **Description:** The `rateLimits` table is used for (1) API rate limiting, (2) SSE connection slot tracking, and (3) heartbeat deduplication. These are semantically different concerns. The table schema has fields like `attempts`, `consecutiveBlocks`, and `blockedUntil` which make sense for rate limiting but are meaningless for SSE slots.
- **Fix:** Create separate tables for SSE connection slots and heartbeat tracking, or add a `category` column with stricter validation.

---

## LOW

### L1: Double-Close Risk in SSE `emitStatusHeartbeat`
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:433-446`
- **Reviewers:** code-reviewer
- **Confidence:** Medium

### L2: `sanitizeHtml` Allows `mailto:` in Anchors Without Validation
- **File:** `src/lib/security/sanitize-html.ts:79`
- **Reviewers:** security-reviewer
- **Confidence:** Low

### L3: Legacy JSON Path in Restore Still Consults `file.type`
- **File:** `src/app/api/v1/admin/restore/route.ts:101`
- **Reviewers:** security-reviewer
- **Confidence:** Low

### L4: `getApiUser` Re-Auth in SSE Doesn't Verify Same User
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:466-470`
- **Reviewers:** security-reviewer
- **Confidence:** Low

### L5: Compiler `runDocker` Missing Timeout on `child.kill`
- **File:** `src/lib/compiler/execute.ts:459-464`
- **Reviewers:** code-reviewer
- **Confidence:** Low

### L6: Audit-Logs CSV Export Missing Row Count Cap Validation
- **File:** `src/app/api/v1/admin/audit-logs/route.ts:218-219`
- **Reviewers:** code-reviewer
- **Confidence:** Low

### L7: Anti-Cheat Heartbeat Gap Detection Loads 5000 Rows into Memory
- **File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:199-227`
- **Reviewers:** perf-reviewer
- **Confidence:** Medium

### L8: `getDbNowUncached` Still Called Inside `withPgAdvisoryLock` Transaction
- **File:** `src/lib/realtime/realtime-coordination.ts:68-73, 94`
- **Reviewers:** perf-reviewer
- **Confidence:** Medium

### L9: Audit-Logs Instructor Scope Requires N+1 Queries
- **File:** `src/app/api/v1/admin/audit-logs/route.ts:74-105`
- **Reviewers:** perf-reviewer
- **Confidence:** Low

### L10: Missing Component Source Files for New Tests
- **Files:** `tests/component/active-timed-assignment-sidebar-panel.test.tsx`, `tests/component/app-sidebar.test.tsx`, `tests/component/conditional-header.test.tsx`
- **Reviewers:** test-engineer
- **Confidence:** High

### L11: `stopSharedPollTimer` Lacks Unit Test Coverage
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:161-166`
- **Reviewers:** test-engineer
- **Confidence:** Medium

### L12: SSE Events Route Has Dual Coordination Paths
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts`
- **Reviewers:** architect
- **Confidence:** Medium

### L13: `stopSharedPollTimer` Added But No `isSharedPollTimerRunning` Query Function
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:161-166`
- **Reviewers:** architect
- **Confidence:** Low

### L14: `compiler/execute.ts` Local Fallback Path Not Covered
- **File:** `src/lib/compiler/execute.ts`
- **Reviewers:** test-engineer
- **Confidence:** Low

---

## Cross-Agent Agreement

- **M1** flagged by both perf-reviewer and code-reviewer (higher signal).
- **M2** flagged by both code-reviewer and perf-reviewer (higher signal).

---

## Recommended Priority for Fixes

1. **Immediate:** L10 (missing component source files) — breaks tests.
2. **Short-term:** M2 (stopSharedPollTimer race) — shutdown hygiene.
3. **Short-term:** L3 (restore file.type) — defense-in-depth, trivial fix.
4. **Medium-term:** M1 (SSE unbounded IN query) — performance under load.
5. **Medium-term:** M3 (compiler assignmentId validation) — security hardening.
6. **Medium-term:** L4 (SSE re-auth same-user check) — security hardening.
7. **Long-term:** M4 (rateLimits table overloading) — architectural debt.
8. **Long-term:** L7 (anti-cheat gap detection) — performance at scale.
