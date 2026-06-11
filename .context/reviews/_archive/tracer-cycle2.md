# Tracer Review — Cycle 2

**Reviewer:** tracer
**Date:** 2026-04-28
**Scope:** Causal tracing of data flows in the recently modified public pages

---

## Traced Flow: Enrolled Contest Detail

1. User navigates to `/contests/[id]`
2. `auth()` returns session
3. `getUserContestAccess(id, userId, role)` queries assignment + enrollment
4. If enrolled: `getEnrolledContestDetail(id, userId, role)` queries assignment again + enrollment again + exam sessions
5. `contest.examSession` used directly (cycle 1 fix removed redundant fallback)
6. `sortedProblems` constructed with `points: ap.points ?? 100`
7. `totalPoints = sortedProblems.reduce((sum, p) => sum + p.points, 0)` — correct (cycle 1 fix)
8. `AssignmentOverview` receives `totalPoints`

**Finding:** Step 6 introduces a subtle issue: if `ap.points` is null, `points` becomes 100. This 100 is not the "actual" points — it's a default. The `totalPoints` will then include this default, potentially inflating the displayed total. See TRC-C2-1.

---

## Traced Flow: Problem Detail with Assignment Context

1. User navigates to `/practice/problems/[id]?assignmentId=abc`
2. `auth()` returns session
3. `validateAssignmentSubmission(assignmentId, problemId, userId, role)` validates access
4. `db.query.assignments.findFirst` fetches assignment with `examDurationMinutes: true` (cycle 1 fix)
5. `assignmentContext.examDurationMinutes = assignment.examDurationMinutes ?? null` (cycle 1 fix)
6. `StartExamButton` receives `durationMinutes={assignmentContext.examDurationMinutes ?? 0}` (cycle 1 fix)
7. If exam mode is windowed and no session exists: `getExamSession(assignmentId, userId)` is called again

**Finding:** Step 7 queries the exam session after `validateAssignmentSubmission` already queried it internally. This is a minor redundancy but not a bug. See TRC-C2-2.

---

## Findings

### TRC-C2-1: [MEDIUM] `points ?? 100` default inflates `totalPoints` when problem points are null

**File:** `src/lib/assignments/public-contests.ts:349`
**Confidence:** MEDIUM

Traced above. When `ap.points` is null (no points set for an assignment-problem link), the value defaults to 100. This default propagates into `totalPoints` which is displayed to students. The root cause is that the DB schema allows `points` to be nullable, but the UI treats null as 100 without any indication that it's a default.

This is the same finding as CR-8 and ARCH-C2-2. The tracer confirms the data flow: `public-contests.ts:349` → `contests/[id]/page.tsx:183` → `totalPoints` at line 184 → `AssignmentOverview` at line 326.

**Fix:** Either make `points` non-null in the assignment creation flow, or display a visual indicator when points is using a default value.

---

### TRC-C2-2: [LOW] Problem detail page calls `getExamSession` redundantly

**File:** `src/app/(public)/practice/problems/[id]/page.tsx:441`
**Confidence:** LOW

The problem detail page calls `getExamSession(assignmentContext.id, session.user.id)` at line 441, but `validateAssignmentSubmission` at line 166 also queries the exam session internally (through `getAssignmentAccessRecord` and the exam session check in the validation flow). While not a bug, this is a redundant DB query.

**Fix:** Have `validateAssignmentSubmission` return the exam session data alongside the validation result, or accept it as a parameter.

---

## Summary

The main traced finding is the `points ?? 100` default inflation risk (TRC-C2-1), which is confirmed by multiple agents.
