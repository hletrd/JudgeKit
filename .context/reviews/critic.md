# Critic Review — Cycle 1 (New Session)

**Reviewer:** critic
**Date:** 2026-04-28
**Scope:** Multi-perspective critique of recent change surface

---

## Findings

### CRIT-1: [HIGH] `totalPoints` reduce initial value is 100 instead of 0 — data integrity bug

**File:** `src/app/(public)/contests/[id]/page.tsx:187`
**Confidence:** HIGH

This is a clear logic error confirmed by 4 independent reviewers (code-reviewer, debugger, verifier, architect). The reduce initial value of `100` inflates the total points displayed to students. This is likely a copy-paste error or misunderstanding of the `reduce` API.

**Fix:** Change `100` to `0`.

---

### CRIT-2: [MEDIUM] Problem detail page silently drops `examDurationMinutes` — breaks windowed exam flow

**File:** `src/app/(public)/practice/problems/[id]/page.tsx:478`
**Confidence:** HIGH

The `assignmentContext` type was defined without `examDurationMinutes`, causing the `StartExamButton` to always receive 0. This is a type completeness gap — the DB query (line 175-186) does not select `examDurationMinutes`, so the type correctly reflects what was queried. The fix requires both updating the query and the type.

**Fix:** Add `examDurationMinutes` to both the DB query columns and the type definition.

---

### CRIT-3: [LOW] Contest detail page has redundant `getExamSession` fallback call

**File:** `src/app/(public)/contests/[id]/page.tsx:173-176`

The `getEnrolledContestDetail` function already queries the exam session (lines 302-313 in `public-contests.ts`), so the fallback `getExamSession` call in the page component is redundant. If `getEnrolledContestDetail` returns `examSession: null`, it means no session exists — the fallback query would return the same result unless a session was created between the two queries (race condition).

**Fix:** Remove the redundant fallback call. If `getEnrolledContestDetail` returns `examSession: null`, that is authoritative.

---

### CRIT-4: [LOW] New public pages add significant rendering complexity without test coverage

The enrolled contest view (~290 lines of JSX) and the assignment context on the problem detail page (~60 lines of branching logic) have zero test coverage. This is a test debt that should be addressed before these pages see production traffic.

**Fix:** Add component/integration tests as outlined in TE-1 and TE-2.

---

## Cross-cutting Concern

The two HIGH/MEDIUM bugs (totalPoints, examDurationMinutes) both stem from the same root cause: the new enrolled contest view was built by extracting logic from the dashboard version, but the extraction was incomplete. The dashboard version calculates totalPoints differently and passes examDurationMinutes correctly. The public version missed both. This suggests the extraction should have been reviewed more carefully or the shared logic should be consolidated.
