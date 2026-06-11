# Test Engineer — RPF Cycle 10 (2026-05-16)

**Cycle:** 3/100 of this RPF loop
**HEAD reviewed:** `23dd9e80`

## Inventory

- 317 unit-test files, 2421 tests at the cycle-9 baseline.
- Existing coverage for the cycle-8 surfaces:
  - `participant-audit-page-implementation.test.ts`
  - `participant-timeline-route-implementation.test.ts`
  - `participant-timeline-view-implementation.test.ts`
  - `plugins.secrets.test.ts`
  - `tests/unit/api/plugins.route.test.ts` (cycle-8 fixed)

## NEW Findings

### TE10-1 — No render-shape test for `ParticipantTimelineBar`
**Severity:** LOW · **Confidence:** HIGH
**File:** `src/components/contest/participant-timeline-bar.tsx` (no
companion test file)

The component renders three layered timelines (legend, unified bar,
per-problem cards). A shallow render assertion covering
("renders one marker per event", "snapshot markers use the rect
shape variant", "first_ac AC markers carry the AC chip") would
catch regressions in event-key collisions, missing `at` rows, and
the cycle-8 "manage view sees per-problem cards" wiring without
needing a full integration test.

**Suggested fix:** Add `tests/unit/contest/participant-timeline-bar.test.tsx`
with a fixture timeline of 1 problem × {submission, snapshot,
first_ac} × {with at, without at} and assert event counts.

### TE10-2 — i18n bag CR10-1 hardcoded strings have no contract test
**Severity:** LOW · **Confidence:** HIGH
**File:** `src/components/contest/participant-timeline-bar.tsx:189, 271`

When CR10-1 lands, a test that asserts no English literal in the
rendered Korean-locale output (e.g. `expect(html).not.toMatch(/Score:/)`)
will keep regressions out.

## Re-verified

- Cycle-9 `language-map.test.ts` (`getHighlightJsLanguage` four
  cases) confirmed at HEAD.
- Cycle-9 `plugins.secrets.test.ts` malformed-write rejection
  confirmed at HEAD.
- Existing 2421-pass baseline still holds (worktree clean).

## Carry-forward deferred

- **TE8b-3** chat-widget-loader role-bypass component test — still
  deferred. Manual confirmation of route-level test
  (`plugins.route.test.ts:337-341` asserts `userRole` is forwarded
  to the AI gate) reduces priority.
- **TE8b-4** capability-list surfacing test on
  `/submissions/[id]/page.tsx` — still deferred.
- **TE8b-5** `canViewAssignmentSubmissions` short-circuit reorder
  test — still deferred; existing cycle-8 reorder coverage indirect.

## Verdict

Two NEW low-severity coverage gaps; both bounded to the cycle-8
participant-timeline-bar feature. No flaky/broken tests at HEAD.
