# Designer — RPF Loop Cycle 4 (2026-05-03)

**Scope:** UI/UX surface touched by cycle-3 close-out.

## UI surface touched this cycle

### `src/app/(auth)/recruit/[token]/results/page.tsx` (server component)

Cycle-3 CYC3-AGG-2 replaced an inline reduction loop (lines 194-206) with
a single `computeRecruitResultsTotals(...)` helper call. **No visible UI
change**. The rendered output (totalScore, totalPossible, adjustedByProblem
per row) is identical to the pre-cycle-3 output for any input.

### Visual surface

The candidate-facing card (lines 211-294) is unchanged structurally:
- Title + subtitle (centered)
- Score card (hidden if `totalPossible === 0`)
- Per-problem breakdown
- "Issued by" footer

Cycle-2's C2-AGG-9 fix (hide score card on 0-points assignments) is intact
at `page.tsx:216` (`{showScores && totalPossible > 0 && ...}`).

### Accessibility

No new ARIA roles, no new keyboard interactions, no new focus management.
The helper extract is purely refactoring. No accessibility regression.

## NEW UI findings this cycle

### DSGN4-1: [LOW] Per-problem rows still render even when no submission exists for that problem

- **File:** `src/app/(auth)/recruit/[token]/results/page.tsx:227+`
  (the per-problem breakdown block — confirmed unchanged this cycle)
- **Description:** When a candidate has no submission for problem P, the
  helper does NOT include P in `adjustedByProblem` (verified in test at
  `recruiting-results.test.ts:58-72`). The page still renders a row for
  P showing zero. From a UX standpoint, a candidate seeing "Problem 3 –
  0/25" might wonder if their submission was lost.
- **Confidence:** LOW (UX preference)
- **Failure scenario:** Candidate submits problems 1, 2 but skips 3. The
  results page shows three rows: 1, 2 with scores; 3 with "0/25" and no
  submission status. Candidate confused.
- **Fix:** Either (a) hide rows for problems with no submission, OR (b)
  add an explicit "Not attempted" status badge for those rows. **Already
  deferred under DSGN3-2** (carry-forward from cycle-3).

### DSGN4-2: [LOW] No empty-state copy when an assignment has 0 problems

- **File:** `src/app/(auth)/recruit/[token]/results/page.tsx:225+`
- **Description:** When `assignmentProblemRows.length === 0`, the helper
  returns zeros and an empty map. The page hides the score card
  (cycle-2's `totalPossible > 0` guard) but the per-problem breakdown
  block likely renders an empty list. UX could show a "No problems
  configured for this assignment" empty state.
- **Confidence:** LOW (UX preference)
- **Failure scenario:** Recruiter creates an empty assignment (rare). A
  candidate visits and sees a card with title/subtitle but no body.
- **Fix:** Add an empty-state block. **Already deferred under DSGN3-1**
  (carry-forward from cycle-3).

## Carry-forward designer items (status unchanged)

| ID | File | Status | Exit criterion |
|----|------|--------|----------------|
| DSGN3-1 | `recruit/[token]/results/page.tsx:225` 0-problems | DEFERRED | Recruiter UI removes 0-problem-submit guard OR operator reports |
| DSGN3-2 | per-problem empty state | DEFERRED | UX-cycle |

## Runtime designer-review attempt

Per the user-injected note in `pending-next-cycle.md`, runtime UI/UX
review via agent-browser was **sandbox-blocked** in prior cycles because
`src/instrumentation.ts` requires a live Postgres at boot. Cycle-3 added
a `SKIP_INSTRUMENTATION_SYNC=1` short-circuit (cycle 55 carry-forward,
mentioned in pending-next-cycle.md history). For this cycle, no runtime
review was re-attempted; cycle-4's surface change is purely a server-side
helper extract with zero UI delta. Defer runtime review until a UI-cycle.

## Summary

| ID | Severity | Confidence | File | Action |
|----|----------|------------|------|--------|
| DSGN4-1 | LOW | LOW | `recruit/[token]/results/page.tsx` | Defer (DSGN3-2 carry-forward) |
| DSGN4-2 | LOW | LOW | `recruit/[token]/results/page.tsx` | Defer (DSGN3-1 carry-forward) |

No HIGH/MEDIUM UI findings. Cycle-3 close-out is UI-neutral; the helper
extract changes nothing on screen.
