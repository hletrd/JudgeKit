# Cycle 1 Review Remediation Plan

**Date:** 2026-04-28
**Source:** `.context/reviews/_aggregate.md` (cycle 1, new session)
**Status:** DONE

---

## Tasks

### Task A: [HIGH] Fix `totalPoints` reduce initial value from 100 to 0
- **Source:** AGG-1 (5-agent convergence: CR-1, DBG-1, VER-1, CRIT-1, TRC-1)
- **File:** `src/app/(public)/contests/[id]/page.tsx:187`
- **Fix:** Change `sortedProblems.reduce((sum, p) => sum + p.points, 100)` to `sortedProblems.reduce((sum, p) => sum + p.points, 0)`
- **Exit criteria:** `totalPoints` equals the sum of problem points with no extra offset
- [x] Done (commit 8ab975b9)

### Task B: [MEDIUM] Add `examDurationMinutes` to `assignmentContext` type and DB query on problem detail page
- **Source:** AGG-2 (6-agent convergence: CR-2, DBG-2, VER-2, CRIT-2, TRC-2, ARCH-3)
- **File:** `src/app/(public)/practice/problems/[id]/page.tsx`
- **Fix:**
  1. Add `examDurationMinutes: number | null` to `assignmentContext` type (lines 152-162)
  2. Add `examDurationMinutes: true` to DB query columns (lines 177-186)
  3. Populate `examDurationMinutes` in `assignmentContext` object (lines 199-209)
  4. Pass `assignmentContext.examDurationMinutes ?? 0` to `StartExamButton` `durationMinutes` prop (line 478)
- **Exit criteria:** `StartExamButton` receives the actual exam duration from the assignment, not hardcoded 0
- [x] Done (commit a96c5d2a)

### Task C: [LOW] Remove redundant `getExamSession` fallback call in contest detail page
- **Source:** AGG-9 (DBG-3, CRIT-3)
- **File:** `src/app/(public)/contests/[id]/page.tsx:173-176`
- **Fix:** Remove lines 173-176 (the fallback `getExamSession` call). Use `contest.examSession` directly from `getEnrolledContestDetail`.
- **Exit criteria:** No redundant `getExamSession` call; `contest.examSession` from `getEnrolledContestDetail` is used directly
- [x] Done (commit 8ab975b9 — included in Task A commit)

### Task D: [LOW] Fix badge colors for dark mode on contest detail page
- **Source:** AGG-13 (DES-1)
- **File:** `src/app/(public)/contests/[id]/page.tsx:236-237`
- **Fix:** Replace hardcoded `bg-blue-500`/`bg-purple-500` with Badge variants that support dark mode, or add `dark:` prefixed classes.
- **Exit criteria:** Exam mode and scoring model badges have proper contrast in both light and dark modes
- [x] Done (commit 8ab975b9 — included in Task A commit)

### Task E: [LOW] Add upstream issue link to ContestDetailLayout comment
- **Source:** AGG-15 (DOC-1)
- **File:** `src/app/(public)/contests/[id]/layout.tsx:7-9`
- **Fix:** Add a TODO note referencing the need to file/track the upstream Next.js RSC streaming bug.
- **Exit criteria:** Comment includes a note about tracking the upstream issue
- [x] Done (commit 39510bae)

---

## Deferred Items

The following findings from the aggregate review are deferred this cycle with reasons:

| AGG ID | Description | Severity | Reason for deferral | Exit criterion |
|--------|-------------|----------|---------------------|----------------|
| AGG-3 | Redundant DB queries in enrolled contest flow | MEDIUM | Requires significant refactoring of `public-contests.ts` data access layer; risk of regression in a hot path. Better done as a dedicated follow-up. | Dedicated query-optimization cycle |
| AGG-4 | DB import error messages leak PostgreSQL internals | MEDIUM | Admin-only endpoint; internal error details help debugging. Defense-in-depth improvement that doesn't fix a user-facing bug. | Next security hardening cycle |
| AGG-5 | `error.message` control-flow discrimination | MEDIUM | Carried from previous cycles. Requires cross-cutting custom error class introduction. Large scope. | Dedicated error-handling refactor cycle |
| AGG-6 | Import route unsafe `as JudgeKitExport` cast | MEDIUM | Carried from previous cycles. Requires Zod schema for entire `JudgeKitExport` type. Large scope. | Dedicated schema-validation cycle |
| AGG-7 | No tests for new public pages | MEDIUM | Test infrastructure exists; tests should be added but are not blocking for bug fixes. Can be done alongside next feature work on these pages. | Next feature iteration on public pages |
| AGG-8 | Contest layout workaround depends on `#main-content` | LOW | Workaround for upstream Next.js bug; adding dev warning is nice-to-have but not blocking. | When layout is next modified |
| AGG-10 | Deprecated JSON import path still fully functional | LOW | Path is deprecated with Sunset header; admin-only endpoint. Will be disabled after sunset date. | After Nov 2026 sunset date |
| AGG-11 | Problem detail page query batching optimization | LOW | Performance micro-optimization; no user-visible impact. | Performance optimization cycle |
| AGG-12 | `resolveCapabilities` called twice | LOW | Cached; negligible overhead. Tracked for completeness. | When `public-contests.ts` is refactored (AGG-3) |
| AGG-14 | Virtual Practice links lose contest context | LOW | Design decision — linking to standalone practice may be intentional. Needs product input. | Product review of virtual practice flow |

---

## Notes

- AGG-1 (totalPoints bug) and AGG-2 (examDurationMinutes) are the highest priority fixes — both are confirmed data integrity bugs visible to students.
- The root cause of both bugs is incomplete extraction of dashboard logic to public pages. The dashboard version calculates totalPoints correctly and passes examDurationMinutes correctly.
- All carried deferred items from previous cycles remain accurate and deferrable at HEAD.
