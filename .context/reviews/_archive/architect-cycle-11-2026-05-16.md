# Architect — RPF Cycle 11 (2026-05-16)

**HEAD reviewed:** `8e10ebdd`. **Angle:** coupling, layering, design risk.

## NEW findings

### ARCH11-1 — `canShowParticipationView` lives in a page file
**Severity:** LOW. **Confidence:** MEDIUM.
**File:** `src/app/(public)/contests/[id]/page.tsx:46-54`

Cycle-10 extracted the predicate next to its first call site, which
removes the duplication but couples a semantically reusable rule
(who sees the "participation view") to a single page module. The
manage-students page (`students/[userId]/page.tsx`) already shows
the timeline component to staff under a different capability check
(`contests.view_analytics`), so the rule may need to be co-located
with the access model.

**Fix:** move the predicate to `src/lib/contests/access.ts` (or
similar), export it, and re-import from the page. The cycle-10 plan
explicitly mentioned "(or in `lib/contests/`)" as an acceptable
location.

**Exit criterion:** the predicate is used outside `(public)/contests/[id]/page.tsx`.

### ARCH11-2 — `TimelineTranslations` shape duplicated at both call sites
**Severity:** LOW. **Confidence:** HIGH.
**File:** `participant-timeline-view.tsx:229-242`,
`(public)/contests/manage/[assignmentId]/students/[userId]/page.tsx:95-108`

Both call sites build the same bag with `tParticipantAudit` /
`t` from the same locale namespace, with nine matching arrow
functions. The `participant-timeline-bar` exports
`TimelineTranslations` only as a non-exported `type` (file-local).

**Fix:** export a helper
`buildParticipantTimelineTranslations(t)` from
`participant-timeline-bar.tsx` (or a sibling file) that returns the
bag, and have both pages call it. This eliminates the drift surface
the next time a key is added or renamed.

### Carry-forward (architecture)

- CR10-4 / ARCH8b-4 — `getEnrolledContestDetail` rename — deferred,
  same exit criterion.
- ARCH8b-1/2 — unchanged.

## Verdict

Two small architecture cleanups worth scheduling (ARCH11-1,
ARCH11-2). Both reduce drift surface for the next cycle that touches
this module.
