# Cycle 6 Designer Review

**Date:** 2026-04-20
**Base commit:** 528cdf29

## Findings

### DES-1: Contest status display inconsistent with actual access control — UX confusion [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx:188-192`
**Description:** The contest detail page shows contest status (upcoming/open/closed) based on `new Date()`. The API routes enforce access using DB time. When the clocks diverge, users see a status that doesn't match what the API allows. This creates a confusing UX where the UI says one thing and the server does another.
**Failure scenario:** Student sees "Contest Open" badge but gets "Contest not started" when trying to view problems, or sees "Contest Closed" but the API still allows submissions.
**Fix:** Use `getDbNow()` for temporal comparisons so UI status matches API enforcement.
**Confidence:** MEDIUM

### DES-2: Submission button state doesn't match actual deadline [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/[id]/page.tsx:187-189`
**Description:** The `isSubmissionBlocked` flag controls whether the submit button is enabled. Using `new Date()` means the button state can be out of sync with the actual deadline enforced by the API. This is a UX issue — users may try to submit when the button appears active but the API rejects them, or the button is disabled when they still have time.
**Failure scenario:** Student finishes a solution with 10 seconds left. The submit button is already disabled (app server clock is ahead). They lose the ability to submit despite having time remaining.
**Fix:** Use `getDbNow()` for consistency.
**Confidence:** MEDIUM
