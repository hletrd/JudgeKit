# Tracer Review — Cycle 1 (New Session)

**Reviewer:** tracer
**Date:** 2026-04-28
**Scope:** Causal tracing of suspicious flows

---

## Findings

### TRC-1: [HIGH] `totalPoints` reduce initial value traces to 100 — confirmed off-by-100 bug

**File:** `src/app/(public)/contests/[id]/page.tsx:187`

**Causal trace:**
1. `sortedProblems` is built at line 181-186 from `contest.problems`
2. `totalPoints` is computed at line 187 with initial value `100`
3. `totalPoints` is passed to `AssignmentOverview` at line 329
4. `AssignmentOverview` renders the total to students

**Hypothesis 1 (copy-paste error):** The initial value `100` may have been intended as a default per-problem point value, but was placed as the reduce seed instead of as a default for `p.points`.

**Hypothesis 2 (misunderstanding):** The developer may have thought `reduce` initial value is a "base" value to add on top of the sum.

**Most likely:** Hypothesis 2. The intent was likely "total points = sum of problem points" with no base value.

**Fix:** Change initial value from `100` to `0`.

---

### TRC-2: [MEDIUM] Windowed exam StartExamButton flow traces to 0-minute duration

**File:** `src/app/(public)/practice/problems/[id]/page.tsx:478`

**Causal trace:**
1. User navigates to `/practice/problems/123?assignmentId=abc`
2. `normalizedAssignmentId` is parsed from `searchParams` (line 120-123)
3. `validateAssignmentSubmission` checks access (line 165-172)
4. Assignment row is queried (line 175-186) but `examDurationMinutes` is NOT in the selected columns
5. `assignmentContext` is built (line 199-209) without `examDurationMinutes`
6. `StartExamButton` receives `durationMinutes={0}` (line 478)
7. If user clicks "Start Exam", the button component calls the exam session API with `durationMinutes: 0`
8. Exam session is created with 0-minute duration, immediately expiring

**Root cause:** The DB query at line 177-186 does not include `examDurationMinutes` in the selected columns. The `assignmentContext` type accurately reflects this omission.

**Fix:** Add `examDurationMinutes` to the DB query columns list AND to the `assignmentContext` type.

---

### TRC-3: [LOW] Enrolled contest detail page traces through redundant query path

**File:** `src/app/(public)/contests/[id]/page.tsx:123-176`

**Causal trace:**
1. `auth()` returns session (line 108)
2. `getUserContestAccess(id, userId, role)` is called (line 124)
   - Queries `assignments` row
   - Queries `enrollments` row
   - Queries `contestAccessTokens` row
   - Calls `resolveCapabilities(role)`
   - Calls `canManageContest(...)`
3. If enrolled, `getEnrolledContestDetail(id, userId, role)` is called (line 126)
   - Queries `assignments` row AGAIN
   - Queries `enrollments` row AGAIN
   - Queries `contestAccessTokens` row AGAIN
   - Calls `resolveCapabilities(role)` AGAIN
   - Calls `canManageContest(...)` AGAIN
   - Queries `examSessions`
4. Back in the page, `getExamSession(...)` is called again (line 175) — redundant

**Root cause:** The two functions are designed for independent use but are called sequentially. No result caching or data sharing between calls.

**Fix:** Merge the two functions or pass the assignment row from the first call to the second.
