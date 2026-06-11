# Architect — RPF Cycle 10 (2026-05-16)

**Cycle:** 3/100 of this RPF loop
**HEAD reviewed:** `23dd9e80`

## NEW Findings

### ARCH10-1 — `TimelineTranslations` bag is locked at the bar but mostly unused
**Severity:** LOW · **Confidence:** HIGH
**Files:** `src/components/contest/participant-timeline-bar.tsx:49-64`
↔ `src/components/contest/participant-timeline-view.tsx:215-245`

The translations bag duplicates the `next-intl` keys the parent
already owns. Of the 13 fields declared, 6 are unused in the render.
The bag pattern (intentional split for server-vs-client boundary)
is OK; the dead fields create the wrong impression that the bar
needs them and discourages cleanup.

**Fix path:** Trim to actually-used keys (CR10-2). Document the
"parent owns translations" boundary in a one-line JSDoc.

### ARCH10-2 — Duplicate `userAccess === "enrolled" || === "managing"` checks
**Severity:** LOW · **Confidence:** HIGH
**File:** `src/app/(public)/contests/[id]/page.tsx:121-131`

The same compound predicate appears twice (once to fetch
`enrolledDetail`, once to branch into the participation view).
After the cycle-8 widening, the predicate semantics now mean
"viewer is participant or manager" — captured naturally by a
helper `canShowParticipationView(userAccess)`.

**Fix:** Extract a small local helper.

## Re-verified

- Cycle-9 `getHighlightJsLanguage` adapter: single-source-of-truth
  for "judge language → hljs", confirmed by grep audit. No new
  parallel maps have appeared.
- Cycle-8 `isAiAssistantEnabledForContext` signature is now
  caller-pass `userRole`; ARCH8b-1 (silent failure mode if caller
  forgets) is still deferred.

## Carry-forward deferred

- ARCH8b-1, ARCH8b-2 (addressed by JSDoc edits), ARCH8b-4
  (`getEnrolledContestDetail` rename) — see CR10-4.

## Verdict

Two LOW architectural housekeeping items; no coupling or layering
regressions.
