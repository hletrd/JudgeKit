# Architecture Review — Cycle 1 (New Session)

**Reviewer:** architect
**Date:** 2026-04-28
**Scope:** Architectural patterns, coupling, layering

---

## Findings

### ARCH-1: [MEDIUM] `getUserContestAccess` and `getEnrolledContestDetail` have significant query overlap

**File:** `src/lib/assignments/public-contests.ts`
**Confidence:** HIGH

Both functions query the same `assignments` row and check enrollment status. When called in sequence from the contest detail page, this results in:
- 2 assignment queries roundtrips
- 2 enrollment query roundtrips
- 2 `resolveCapabilities` calls
- 2 `canManageContest` calls

This violates the principle of composing data access at the right granularity. The caller (page component) should be able to get access + detail in a single pass.

**Fix:** Create a unified `getContestDetailForUser(assignmentId, userId, role)` function that returns both the access level and the detail in one query, or at minimum returns the assignment row from `getUserContestAccess` so `getEnrolledContestDetail` can reuse it.

---

### ARCH-2: [LOW] Public contest detail page is a single 680-line server component with two distinct render paths

**File:** `src/app/(public)/contests/[id]/page.tsx`
**Confidence:** MEDIUM

The enrolled student view (lines 131-421) and the public view (lines 424-680) are completely different rendering paths within the same component. This is a common Next.js pattern for auth-aware pages, but at 680 lines, the file is becoming difficult to navigate and test independently.

**Fix:** Consider extracting the enrolled view into a separate component (e.g., `EnrolledContestView`) and the public view into `PublicContestView`. The page component would handle auth routing and delegate rendering.

---

### ARCH-3: [LOW] `assignmentContext` type in problem detail page is missing `examDurationMinutes`

**File:** `src/app/(public)/practice/problems/[id]/page.tsx:152-162`
**Confidence:** HIGH (confirmed bug — see CR-2)

The `assignmentContext` type deliberately omits `examDurationMinutes`, causing the `StartExamButton` to receive 0 instead of the actual duration. This is both a type design gap and a bug.

**Fix:** Add `examDurationMinutes: number | null` to the `assignmentContext` type and populate it from the DB query.

---

## Architectural Observations (No Action Needed)

- The public route structure (`/(public)/contests/[id]`, `/(public)/practice/problems/[id]`) is clean and follows Next.js App Router conventions.
- The `public-contests.ts` module properly encapsulates data access for public contest pages.
- The RSC streaming workaround in `layout.tsx` is appropriately scoped and documented with a TODO for removal.
