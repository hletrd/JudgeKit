# Cycle 7 Review Remediation Plan

**Date:** 2026-05-11
**Source:** `.context/reviews/_aggregate.md` (cycle 7)
**New findings:** 10 (2 MEDIUM, 8 LOW)
**Carried from cycle 6:** 11 unfixed findings
**Status:** Completed

---

## Overview

This plan addresses the most impactful findings from cycle 7 review. Security, correctness, and data-loss findings are prioritized per project rules. Larger architectural refactors are deferred with clear exit criteria.

---

## Task 1: Fix Playground Run Route Platform Mode Bypass [M1]

**Priority:** MEDIUM (security/correctness)
**Confidence:** High
**Files:** `src/app/api/v1/playground/run/route.ts`

**What to do:**
Add the same platform mode checks that exist in `compiler/run/route.ts`:
1. Import `getEffectivePlatformMode` and `getPlatformModePolicy` from `@/lib/platform-mode-context` and `@/lib/platform-mode`
2. Call `getEffectivePlatformMode({ userId: user.id, assignmentId: null })` 
3. Check `getPlatformModePolicy(platformMode).restrictStandaloneCompiler` and return 403 if true

**Verification:**
- Submit to playground while in exam mode → expect 403
- Submit to playground while in standalone mode → expect success

---

## Task 2: Move `getDbNowUncached()` out of advisory lock transactions [L6]

**Priority:** LOW (performance/correctness)
**Confidence:** High
**Files:** `src/lib/realtime/realtime-coordination.ts`

**What to do:**
In both `acquireSharedSseConnectionSlot` and `shouldRecordSharedHeartbeat`, call `getDbNowUncached()` before entering `withPgAdvisoryLock`, and pass the timestamp into the transaction closure.

**Verification:**
- `tsc --noEmit` passes
- Existing SSE connection tests pass
- No functional change; lock duration should decrease

---

## Task 3: Fix unsafe cursor decoding cast in submissions list [L12]

**Priority:** LOW (correctness)
**Confidence:** Low
**Files:** `src/app/api/v1/submissions/route.ts:64-67`

**What to do:**
Validate `decoded.t` is a string before passing to `new Date`:
```ts
if (decoded && typeof decoded === "object" && "t" in decoded && typeof decoded.t === "string") {
  cursorSubmittedAt = new Date(decoded.t);
}
```

**Verification:**
- `tsc --noEmit` passes
- Unit tests for cursor pagination pass

---

## Task 4: Move enableAntiCheat check earlier in anti-cheat POST [L13]

**Priority:** LOW (performance/defense)
**Confidence:** Low
**Files:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:44-78`

**What to do:**
Move the `if (!assignment.enableAntiCheat) return apiSuccess({ logged: false })` check to immediately after `getContestAssignment` returns, before enrollment and time-boundary checks.

**Verification:**
- Anti-cheat tests pass
- Events for disabled anti-cheat assignments return quickly without enrollment checks

---

## Deferred Items

The following findings are deferred per project rules. Security/correctness findings that require substantial refactoring are deferred with exit criteria.

### DEFER-1: SSE `sharedPollTick` Unbounded `inArray` Query [M2]
- **Severity:** MEDIUM
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:224-232`
- **Reason:** Requires redesign of the shared polling strategy. Querying by status instead of ID list changes semantics — we would need to dispatch results only to subscribers for those IDs. Not a trivial change.
- **Exit criterion:** When SSE connection count exceeds 200 in production metrics, or next cycle prioritizes SSE performance.

### DEFER-2: `stopSharedPollTimer` Race with In-Progress `sharedPollTick` [L1]
- **Severity:** LOW (was MEDIUM in cycle 6, downgraded to LOW because graceful shutdown is best-effort and Node.js handles in-flight promises on exit)
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:161-166`
- **Reason:** Requires tracking active promises. Low practical impact — shutdown is already best-effort.
- **Exit criterion:** If shutdown-related DB connection leaks are observed in production logs.

### DEFER-3: Compiler Route `assignmentId` Information Disclosure [L2]
- **Severity:** LOW
- **File:** `src/app/api/v1/compiler/run/route.ts:25,33-35`
- **Reason:** Low-severity info disclosure only. Assignment IDs are not secret (they appear in URLs). The response differentiation is minimal.
- **Exit criterion:** If assignment enumeration becomes a reported concern.

### DEFER-4: `sanitizeHtml` Allows `mailto:` [L3]
- **Severity:** LOW
- **File:** `src/lib/security/sanitize-html.ts:79`
- **Reason:** DOMPurify core sanitization already handles mailto payloads. The regex is secondary defense.
- **Exit criterion:** If a mailto-based XSS is demonstrated against the current DOMPurify version.

### DEFER-5: Compiler `runDocker` Missing Timeout on `child.kill` [L4]
- **Severity:** LOW
- **File:** `src/lib/compiler/execute.ts:459-464`
- **Reason:** The `docker rm -f` in cleanup is forceful; container state inconsistencies are handled by the retry loop in `inspectContainerState`. No observed production issues.
- **Exit criterion:** If container cleanup failures are observed in production logs.

### DEFER-6: Anti-Cheat Heartbeat Gap Detection Loads 5000 Rows [L5]
- **Severity:** LOW
- **File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:199-227`
- **Reason:** Requires SQL-level gap detection rewrite. 5000 rows at ~60s intervals covers 83 hours; this is sufficient for typical contests. Memory impact is bounded.
- **Exit criterion:** When contests regularly exceed 72 hours, or memory profiling shows anti-cheat as a hotspot.

### DEFER-7: `rateLimits` Table Overloaded [L7]
- **Severity:** LOW (was MEDIUM in cycle 6)
- **File:** `src/lib/realtime/realtime-coordination.ts`
- **Reason:** Architectural debt requiring schema migration and dual-write period. Current approach works correctly; the semantic mismatch is a maintenance concern, not a runtime bug.
- **Exit criterion:** When the next major schema migration is planned, or when SSE/heartbeat functionality needs new fields.

### DEFER-8: Audit-Logs Instructor Scope N+1 Queries [L8]
- **Severity:** LOW
- **File:** `src/app/api/v1/admin/audit-logs/route.ts:74-105`
- **Reason:** Requires SQL rewrite to CTEs or joins. The current sequential queries are clear and correct. N+1 impact is bounded by the number of resources an instructor owns.
- **Exit criterion:** When audit-log query latency becomes a reported issue.

### DEFER-9: SSE Dual Coordination Paths [L9]
- **Severity:** LOW
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts`
- **Reason:** Refactoring to an interface-based strategy is a medium-sized refactor with no immediate correctness benefit.
- **Exit criterion:** When adding a third coordination backend (e.g., Redis).

### DEFER-10: Compiler Dual Code Paths [L10]
- **Severity:** LOW
- **File:** `src/lib/compiler/execute.ts`
- **Reason:** The Rust runner is the production path; local fallback is for development. Documented and intentional.
- **Exit criterion:** When local fallback is deprecated.

### DEFER-11: `submissionSubscribers` Map Leak [L11]
- **Severity:** LOW
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:179-209`
- **Reason:** The abort signal covers normal disconnects. Edge cases (TCP partition without FIN/RST) are rare in HTTP/1.1 with keep-alive. The Map size is bounded by `MAX_GLOBAL_SSE_CONNECTIONS`.
- **Exit criterion:** If subscriber Map growth is observed in production memory profiling.

---

## Progress Tracking

| Task | Status | Commit |
|------|--------|--------|
| Task 1: Playground platform mode | DONE | `4942d137` |
| Task 2: getDbNowUncached out of lock | DONE | `4a0fdd02` |
| Task 3: Cursor cast fix | DONE | `b616e999` |
| Task 4: Anti-cheat early check | DONE | `c10b3a33` |

---

## Gate Status

- [x] eslint — 0 errors, 0 warnings
- [x] next build — success
- [x] vitest — 317 files, 2399 tests passed
