# Cycle 7 — designer (UI/UX)

## UX symptom of N7-C7 — instructor mental-model break
The score-override action lives in the gradebook/student-status view (`score-override-dialog.tsx`), launched from a per-cell pencil affordance. The dialog shows "Automated score: {currentScore}/{maxPoints}" and lets the instructor set an override; on success it `router.refresh()` and the gradebook cell updates (an `isOverridden` flag is even surfaced). The instructor's reasonable expectation is that the override is now this student's score for that problem. But the **contest leaderboard** (a separate page for the same assignment) and the **exported standings CSV** keep the pre-override value (N7-C7). This is a classic consistency/feedback violation: the same data shown two ways, disagreeing, with no UI hint explaining why. The fix (apply overrides in the IOI ranking) resolves the UX inconsistency directly.

## a11y spot-checks (score-override dialog) — OK
- Icon-only trigger button has both `title` and `aria-label={labels.scoreOverride}`; the `Pencil` icon is `aria-hidden`. Accessible name present.
- Numeric input has an associated `<Label htmlFor>`; `DialogTitle`/`DialogDescription` provide dialog labelling.
- Korean text: no custom `letter-spacing`/`tracking-*` applied (per CLAUDE.md rule). Compliant.

## Leaderboard view — OK
Non-instructor responses strip `userId` and anonymize in exam mode (`leaderboard/route.ts:70-85`); current-user row identified via `isCurrentUser`/`liveRank` rather than PII. Sound privacy UX.

No net-new UI-only findings; the only UX issue is the surface symptom of N7-C7.
