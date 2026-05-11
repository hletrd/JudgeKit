# Cycle 8 Review Remediation Plan

**Date:** 2026-05-11
**Source:** `.context/reviews/_aggregate-cycle-8.md`
**New findings:** 14 (2 MEDIUM, 12 LOW)
**Status:** Completed

---

## Task 1: Remove Unused `redirect` from verify-email useEffect Dependencies [L3]

**Priority:** LOW
**Confidence:** High
**Files:** `src/app/(auth)/verify-email/page.tsx:61`

**What to do:**
Remove `redirect` from the `useEffect` dependency array since it is only used in JSX, not inside the effect.

**Verification:**
- `tsc --noEmit` passes
- Component tests pass

**Status:** DONE — commit `0740a12a`

---

## Task 2: Clean Up `as` Casts in Admin Submissions Export Route [L2]

**Priority:** LOW
**Confidence:** Low
**Files:** `src/app/api/v1/admin/submissions/export/route.ts:46-47`

**What to do:**
Refactor the status filter extraction to avoid the double `as` cast. Use a helper function or type predicate.

**Verification:**
- `tsc --noEmit` passes
- Export route tests pass

**Status:** DONE — commit `089a7471`

---

## Task 3: Remove Explicit `process.exit` from SIGTERM Handler [L9]

**Priority:** LOW
**Confidence:** Low
**Files:** `src/lib/audit/node-shutdown.ts:37-43`

**What to do:**
Remove the explicit `processLike.exit(0)` call from the SIGTERM handler to allow Node.js to exit naturally after the event loop drains. Keep the flush behavior.

**Verification:**
- `tsc --noEmit` passes
- Node shutdown tests pass

**Status:** DONE — commit `e52929d5`

---

## Task 4: Fix Drag-and-Drop File Type Filtering [L1]

**Priority:** LOW
**Confidence:** Medium
**Files:** `src/app/(public)/problems/create/create-problem-form.tsx:562,574`

**What to do:**
Remove the `file.type.startsWith("image/")` filter from drag-and-drop handlers, or replace with a client-side validation that inspects file content. Since the server validates with magic bytes anyway, the simplest fix is to remove the type-based filter and let the server reject non-images.

**Verification:**
- `tsc --noEmit` passes
- Component tests pass

**Status:** DONE — commit `030c5ce8`

---

## Deferred Items

### DEFER-1: SSE `sharedPollTick` Unbounded `inArray` Query [M1]
- **Severity:** MEDIUM
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:224-232`
- **Reason:** Requires redesign of shared polling strategy. Deferred in cycle 7.
- **Exit criterion:** When SSE connection count exceeds 200 in production metrics.

### DEFER-2: `rateLimits` Table Overloaded [M2]
- **Severity:** MEDIUM
- **File:** `src/lib/realtime/realtime-coordination.ts`
- **Reason:** Requires schema migration and dual-write period. Deferred in cycle 7.
- **Exit criterion:** Next major schema migration.

### DEFER-3: Compiler `runDocker` Missing Timeout on `child.kill` [L4]
- **Severity:** LOW
- **File:** `src/lib/compiler/execute.ts:459-464`
- **Reason:** Low practical impact; Docker `rm -f` in cleanup handles stuck containers. Deferred in cycle 7.
- **Exit criterion:** If container cleanup failures observed in production logs.

### DEFER-4: `pre-restore-snapshot.ts` Cross-Runtime Type Assertion [L5]
- **Severity:** LOW
- **File:** `src/lib/db/pre-restore-snapshot.ts:87`
- **Reason:** Runtime-safe cross-environment type cast; refactor requires upstream type changes.
- **Exit criterion:** When Node.js stream types align with Web Streams spec.

### DEFER-5: `stopSharedPollTimer` Race with In-Flight Promise [L6]
- **Severity:** LOW
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:161-166`
- **Reason:** Requires tracking active promises. Deferred in cycle 7.
- **Exit criterion:** If shutdown-related DB connection leaks observed.

### DEFER-6: Anti-Cheat Heartbeat Gap Detection Loads 5000 Rows [L7]
- **Severity:** LOW
- **File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:199-208`
- **Reason:** 5000 rows covers 83 hours; sufficient for typical contests. Deferred in cycle 7.
- **Exit criterion:** Contests regularly exceed 72 hours.

### DEFER-7: `submissionSubscribers` Map Leak [L8]
- **Severity:** LOW
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:179-209`
- **Reason:** Bounded by MAX_GLOBAL_SSE_CONNECTIONS. Deferred in cycle 7.
- **Exit criterion:** Subscriber Map growth observed in production memory profiling.

### DEFER-8: Contest Layout Next.js Workaround [L10]
- **Severity:** LOW
- **Files:** `src/app/(public)/contests/manage/layout.tsx`, `src/app/(public)/contests/[id]/layout.tsx`
- **Reason:** Upstream bug tracked at next.js#76472.
- **Exit criterion:** Next.js >= 16.3 with fix.

### DEFER-9: Missing Unit Tests for `stopSharedPollTimer` [L11]
- **Severity:** LOW
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:161-166`
- **Reason:** Test coverage gap; not a correctness issue.
- **Exit criterion:** When SSE coordination is refactored.

### DEFER-10: Compiler Local Fallback Path Uncovered [L12]
- **Severity:** LOW
- **File:** `src/lib/compiler/execute.ts`
- **Reason:** Test coverage gap; Rust runner is production path.
- **Exit criterion:** When local fallback becomes primary path.

---

## Progress Tracking

| Task | Status | Commit |
|------|--------|--------|
| Task 1: verify-email useEffect deps | DONE | `0740a12a` |
| Task 2: export route casts | DONE | `089a7471` |
| Task 3: SIGTERM process.exit | DONE | `e52929d5` |
| Task 4: drag-and-drop file.type | DONE | `030c5ce8` |

---

## Gate Status

- [x] eslint — 0 errors, 0 warnings
- [x] next build — success
- [x] vitest — 317 files, 2399 tests passed
