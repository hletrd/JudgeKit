# Architecture Review — Cycle 2

**Reviewer:** architect
**Date:** 2026-04-28
**Scope:** Verification of cycle 1 fixes + architectural analysis

---

## Cycle 1 Fix Verification

All cycle 1 fixes are architecturally sound. The `totalPoints` fix, `examDurationMinutes` addition, and fallback removal are minimal and correct. The dark mode badge fix follows the existing pattern in `public-contest-list.tsx`.

---

## New Findings

### ARCH-C2-1: [LOW] Contest listing page has duplicated `getContestStatusBorderClass` function

**File:** `src/app/(public)/contests/page.tsx:26-37`
**Confidence:** HIGH

The `getContestStatusBorderClass` function is defined in both `contests/page.tsx` and `public-contest-list.tsx:31-42`. The `public-contest-list.tsx` version includes dark mode variants while the `page.tsx` version does not. This is a DRY violation that leads to inconsistent styling.

**Fix:** Extract `getContestStatusBorderClass` (with dark mode variants) to a shared utility and import it in both files.

---

### ARCH-C2-2: [LOW] `points ?? 100` default is scattered across 6+ locations

**Files:**
- `src/lib/assignments/public-contests.ts:349`
- `src/lib/assignments/submissions.ts:536`
- `src/lib/assignments/participant-timeline.ts:213,280`
- `src/app/api/v1/groups/[id]/assignments/[assignmentId]/route.ts:160`
- `src/app/api/v1/groups/[id]/assignments/[assignmentId]/overrides/route.ts:86`
- `src/components/assignment/assignment-overview.tsx:272`

**Confidence:** MEDIUM

The magic number `100` as a default for `points` is repeated across the codebase without a shared constant or helper. This makes it fragile — if the default changes, all locations must be updated.

**Fix:** Extract a shared constant like `DEFAULT_PROBLEM_POINTS = 100` and use it consistently.

---

## Architectural Observations (No Action Needed)

- The public page structure is clean and follows Next.js App Router conventions.
- The `AssignmentOverview` shared component is well-designed with configurable `problemHrefPrefix` for both dashboard and public use.
