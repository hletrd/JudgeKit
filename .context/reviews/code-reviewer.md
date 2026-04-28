# Code Review — Cycle 1 (New Session)

**Reviewer:** code-reviewer
**Date:** 2026-04-28
**Scope:** Full repository, with focus on recent changes (public contest/problem pages)

---

## Findings

### CR-1: [HIGH] `totalPoints` calculation inflated by 100 in enrolled contest view

**File:** `src/app/(public)/contests/[id]/page.tsx:187`
**Confidence:** HIGH

```tsx
const totalPoints = sortedProblems.reduce((sum, p) => sum + p.points, 100);
```

The `reduce` initial value is `100` instead of `0`. This means the total is always 100 points higher than the actual sum of problem points. For a contest with three 100-point problems, the displayed total would be 400 instead of 300.

**Failure scenario:** Any enrolled student viewing a contest sees an incorrect total points value in the `AssignmentOverview` component. This is a visible data integrity bug on the student-facing page.

**Fix:** Change the initial value from `100` to `0`:
```tsx
const totalPoints = sortedProblems.reduce((sum, p) => sum + p.points, 0);
```

---

### CR-2: [MEDIUM] `StartExamButton` on problem detail page always passes `durationMinutes={0}`

**File:** `src/app/(public)/practice/problems/[id]/page.tsx:476-480`
**Confidence:** HIGH

```tsx
<StartExamButton
  groupId={assignmentContext.groupId}
  assignmentId={assignmentContext.id}
  durationMinutes={0}
/>
```

The `assignmentContext` type (defined at lines 152-162) does not include `examDurationMinutes`, so the button always receives 0 for the duration. In the contest detail page (`contests/[id]/page.tsx:288`), the same button correctly uses `contest.examDurationMinutes ?? 0`.

**Failure scenario:** When a student navigates to a problem within a windowed exam context via `/practice/problems/[id]?assignmentId=...`, the Start Exam button displays a 0-minute exam, which is misleading and could fail to create a proper exam session.

**Fix:** Add `examDurationMinutes` to the `assignmentContext` type and populate it from the DB query.

---

### CR-3: [MEDIUM] `error.message` used as control-flow discriminator across 15+ API catch blocks

**Files:** Multiple API route files (see aggregate for full list)
**Confidence:** HIGH (confirmed from code)

This is a carried-over finding. Multiple API route handlers use `error.message === "someString"` or `switch (error.message)` to discriminate error types. This anti-pattern is fragile: refactoring error messages silently breaks control flow, and messages could be non-unique.

**Fix:** Introduce custom error classes (e.g., `class AppError extends Error { code: string }`). Plan incrementally.

---

### CR-4: [MEDIUM] Import route JSON path still uses unsafe `as JudgeKitExport` cast

**File:** `src/app/api/v1/admin/migrate/import/route.ts:164-166`
**Confidence:** HIGH

The Zod schema defines `data: z.unknown().optional()`, which accepts any value. The data is then cast with `as JudgeKitExport` (line 165) or `as unknown as JudgeKitExport` (line 166). While `validateExport()` runs afterward, the cast itself is unsound.

**Fix:** Create a proper Zod schema for `JudgeKitExport` and use it as the `data` field type.

---

### CR-5: [LOW] `ContestDetailLayout` queries `document.getElementById("main-content")` without null guard

**File:** `src/app/(public)/contests/[id]/layout.tsx:37`
**Confidence:** LOW

```tsx
const main = document.getElementById("main-content");
main?.addEventListener("click", handler, true);
```

The optional chaining on `addEventListener` is fine, but if `#main-content` is not rendered, the click handler is never attached and hard-navigation silently fails. This is a workaround for a Next.js 16 RSC streaming bug, so it is inherently fragile. If the `main-content` ID is ever renamed, the workaround breaks silently.

**Fix:** Add a console warning when `#main-content` is not found (dev mode only).

---

## File Inventory

All major files in the recently changed set were examined:
- `src/app/(public)/contests/[id]/page.tsx` - enrolled + public contest views
- `src/app/(public)/contests/[id]/layout.tsx` - RSC bug workaround
- `src/app/(public)/contests/page.tsx` - contest listing
- `src/app/(public)/practice/problems/[id]/page.tsx` - problem detail with assignment context
- `src/lib/assignments/public-contests.ts` - public contest data access
- `src/lib/auth/config.ts` - auth configuration
- `src/lib/security/env.ts` - environment validation
- `src/lib/db/import.ts` - database import engine
- `src/app/api/v1/admin/migrate/import/route.ts` - import API route
- `src/components/exam/anti-cheat-monitor.tsx` - anti-cheat event capture
- `src/components/exam/countdown-timer.tsx` - exam countdown timer
- `src/app/api/v1/submissions/[id]/events/route.ts` - SSE connection tracking

---

## Previously Resolved Items Verified

- Anti-cheat `describeElement` no longer captures `textContent` (confirmed: lines 219-220 explicitly omit text content). Previous AGG-4 finding is now fixed.
- CountdownTimer uses server time sync with AbortController (confirmed: lines 67-93).
- SSE connection tracking now uses FIFO eviction + stale-cleanup (confirmed: lines 39-75).
