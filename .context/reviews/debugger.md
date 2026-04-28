# Debugger Review — Cycle 1 (New Session)

**Reviewer:** debugger
**Date:** 2026-04-28
**Scope:** Latent bug surface, failure modes, regressions

---

## Findings

### DBG-1: [HIGH] `totalPoints` always inflated by 100 — visible bug in student-facing UI

**File:** `src/app/(public)/contests/[id]/page.tsx:187`
**Confidence:** HIGH

```tsx
const totalPoints = sortedProblems.reduce((sum, p) => sum + p.points, 100);
```

The reduce initial value is `100` instead of `0`. This is a definite logic error. The `totalPoints` value is passed to `AssignmentOverview` at line 329, which displays it to students.

**Concrete failure scenario:**
- Contest has 3 problems, each worth 100 points
- Expected total: 300
- Actual total displayed: 400 (300 + 100 initial value)
- Student sees "Total: 400 points" when the contest is actually 300 points

**Fix:** Change initial value from `100` to `0`.

---

### DBG-2: [MEDIUM] `StartExamButton` on problem detail page receives `durationMinutes={0}` for windowed exams

**File:** `src/app/(public)/practice/problems/[id]/page.tsx:478`
**Confidence:** HIGH

The `assignmentContext` type doesn't include `examDurationMinutes`, so the button always gets 0. This could cause:
1. The exam session to be created with a 0-minute duration
2. The button UI to show "0 min" which is confusing
3. Immediate expiration of the exam session

**Concrete failure scenario:** Student navigates to a problem via `/practice/problems/123?assignmentId=abc`. The contest has `examMode: "windowed"` with `examDurationMinutes: 120`. The student clicks "Start Exam" and the exam session is created with 0 minutes, immediately expiring.

**Fix:** Add `examDurationMinutes` to `assignmentContext` and pass it through.

---

### DBG-3: [LOW] Potential race condition in contest detail page — `getExamSession` called twice

**File:** `src/app/(public)/contests/[id]/page.tsx:173-176`

```tsx
let examSession = contest.examSession;
if (contest.examMode === "windowed" && !examSession) {
  examSession = await getExamSession(contest.id, session.user.id);
}
```

The `contest.examSession` comes from `getEnrolledContestDetail` (lines 302-313), which also queries `examSessions`. If the exam session is created between the two queries, the page could show inconsistent state. This is a low-probability race but worth noting for timed exam flows where session creation timing matters.

**Fix:** Use a single query path. The `getEnrolledContestDetail` function already queries exam sessions — the fallback query on lines 173-176 should not be needed if `getEnrolledContestDetail` is correctly returning the session.

---

### DBG-4: [LOW] `ContestDetailLayout` workaround depends on `#main-content` element existing

**File:** `src/app/(public)/contests/[id]/layout.tsx:36-37`

```tsx
const main = document.getElementById("main-content");
main?.addEventListener("click", handler, true);
```

If the `#main-content` element does not exist (e.g., layout change, SSR hydration mismatch), the click handler is never attached. The workaround silently fails, and users on contest pages would experience broken client-side navigation (RSC payload corruption).

**Fix:** Add a development-only warning if `#main-content` is not found.

---

## Regression Verification

All recent commits were reviewed:
- `1ee90015` (redirect dashboard contest pages to public URLs) — No regression risk; redirects are simple
- `db9ddbc8` (My Contests section) — New feature; no regression
- `565d68ad` (assignment context on problem detail) — Introduces CR-2/DBG-2 bug
- `4df35c7f` (auth-aware contest detail) — Introduces CR-1/DBG-1 bug
- `21671fdd` (assignmentId through PublicQuickSubmit) — No regression; passes prop through
