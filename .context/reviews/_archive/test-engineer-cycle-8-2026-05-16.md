# Test-Engineer — RPF Cycle 8 (2026-05-16)

**Date:** 2026-05-16

---

## Findings

### TE8b-1 — Three test files asserted contradicting policies
**Severity:** MEDIUM (gate-blocking) **Confidence:** HIGH
**Files:**
- `tests/unit/plugins.secrets.test.ts:21,105,136`
- `tests/unit/data-retention.test.ts:19,43`
- `tests/unit/api/plugins.route.test.ts:337-341`

User-injected behavior changes invalidated existing tests. Updated this
cycle:
- plugins.secrets.test.ts now expects plaintext storage and verbatim
  decryption.
- data-retention.test.ts now expects `chatMessages: 365 * 5`.
- plugins.route.test.ts now expects `userRole: "student"` in the
  `isAiAssistantEnabledForContext` call.

**Status:** FIXED.

---

### TE8b-2 — TLE-budget classifier had no direct unit coverage
**Severity:** LOW **Confidence:** HIGH
**File:** `judge-worker-rs/src/executor.rs:519-533`

The user-injected change to executor.rs added a TLE classification
branch (`timed_out && !exceeded_problem_limit → RuntimeError`) that
was previously inline in `execute_inner`. Inline = untestable without a
real container. Cycle-8 fix: extracted `classify_test_case_verdict`
pure helper and added 9 tests covering:
- accepted clean run
- wrong answer
- TLE from Docker duration only
- TLE from kill+duration both crossing
- "765ms < 1000ms" RuntimeError branch (the regression that motivated
  the budget)
- OOM kill
- exit 137 → memory limit
- non-zero exit → runtime error
- TLE precedence over runtime error when both fire

**Status:** FIXED. Rust suite went from 55 → 64 tests, all passing.

---

### TE8b-3 — No regression test for ChatWidgetLoader role-bypass
**Severity:** LOW **Confidence:** HIGH
**File:** `src/components/plugins/chat-widget-loader.tsx:5-15`

The user-injected fix to forward `userRole` so admins keep the chat
floating button during platform-mode contests has no React component
test. The `tests/unit/api/plugins.route.test.ts` covers the chat route
path (and was updated for the userRole assertion), but the loader
itself isn't smoke-tested.

**Defer:** The loader is a thin wrapper around two pure async calls.
Direct unit coverage is plannable but not blocking.

---

### TE8b-4 — No regression test for capabilities surfacing on `/submissions/[id]`
**Severity:** LOW **Confidence:** HIGH
**File:** `src/app/(public)/submissions/[id]/page.tsx:103,207`

`capabilities={[...]}` was previously hard-coded `[]`, which hid the
rejudge button from instructors. The fix passes the actual capability
list. No test asserts this. Defer for next cycle: add a page-level
component test that mounts SubmissionDetailClient with an instructor
role and asserts the rejudge action surfaces.

---

### TE8b-5 — No regression test for canViewAssignmentSubmissions early short-circuit
**Severity:** LOW **Confidence:** HIGH
**File:** `src/lib/assignments/submissions.ts:347-359`

The `if (!assignmentId) return false` block was moved BELOW the
`submissions.view_all` capability check. This lets admins/super_admins
view submissions even when the submission has no assignmentId
(practice/standalone). `tests/unit/assignments/submissions.test.ts`
should cover this branch — verify next cycle.

**Defer:** Plannable.

---

## Verification

- Unit tests: 2410/2410 PASS.
- Rust tests: 64/64 PASS.
- Lint: PASS, build: PASS.
