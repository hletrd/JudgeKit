# Test Engineer — RPF Cycle 11 (2026-05-16)

**HEAD reviewed:** `8e10ebdd`. **Angle:** coverage, flake, TDD.

## NEW findings

### TE11-1 — no test asserts that `formatDuration` clamps at 0
**Severity:** LOW. **Confidence:** HIGH.
**File:** `tests/component/participant-timeline-bar.test.tsx` (gap)

Cycle-10 added the `Math.max(0, totalSeconds)` clamp for DBG10-2
(pre-start events would render `"0m -5s"`). The new test file does
not assert this clamp directly — every fixture timestamp is `>=
start`. A future regression that removes the clamp would not be
caught by the suite.

**Fix:** add a fixture event whose `at < participant.examStartedAt`
and assert the rendered tooltip contains `"0분 0초"` (ko) or `"0m 0s"`
(en), not a negative number.

### TE11-2 — no test asserts the `canShowParticipationView` helper
**Severity:** LOW. **Confidence:** MEDIUM.
**File:** `src/app/(public)/contests/[id]/page.tsx:52-54` (no companion test)

The extracted predicate is small but is now the single source of
truth for two `if (…)` branches. A 4-row truth table (`enrolled`,
`managing`, `null`, `"viewing-public"` or whatever the union grows
to) would catch silent semantic drift if the union type ever gains
a new variant.

**Fix:** extract the helper to a separately-importable module (or
keep co-located but export it) and add a one-shot vitest case.

### TE11-3 (paired with CR11-1) — no negative test guarding deletion of dead i18n keys
**Severity:** LOW. **Confidence:** LOW.

Once CR11-1 deletes the six orphaned `problemSummary` leaves, a
no-regression test could enumerate the keys touched by
`participant-timeline-view.tsx` / `students/[userId]/page.tsx` and
fail if any of them is missing. This is overkill for six strings;
deferral acceptable.

## Verifier check on cycle-10 tests

- `tests/component/participant-timeline-bar.test.tsx` present and
  green (5 tests).
- `participant-timeline-view-implementation.test.ts` updated.
- 2422 unit tests pass at HEAD.

## Verdict

Two small, scoped test additions worth scheduling (TE11-1, TE11-2).
TE11-3 deferred.
