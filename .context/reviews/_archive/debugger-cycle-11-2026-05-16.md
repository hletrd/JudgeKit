# Debugger — RPF Cycle 11 (2026-05-16)

**HEAD reviewed:** `8e10ebdd`. **Angle:** latent bugs, failure modes.

## NEW findings

### DBG11-1 — `formatScore(0, locale)` shows `Score: 0` but other zero-score paths suppress
**Severity:** LOW. **Confidence:** MEDIUM.
**File:** `participant-timeline-bar.tsx:285-287`

```tsx
{ev.score !== null && ev.score !== undefined ? (
  <div>{tr.scoreLabel(formatScore(ev.score, locale))}</div>
) : null}
```

This correctly preserves `0` (which is a legitimate score). However,
this conflicts with the per-problem card path (lines 374-376), which
uses `summary.bestScore ?? "-"` and so renders `"best: 0"` for
all-zero attempts. Behaviourally consistent (both show zero), but the
tooltip renders "Score: 0" twice in quick succession for `wrong_answer
+ score=0` events, which can read oddly.

**Failure scenario:** judge runs that emit `score: 0` for failed
test cases produce noisy tooltips. Cosmetic; not data-corrupting.

**Fix:** consider hiding the score row when status is one of
`{wrong_answer, time_limit, memory_limit, runtime_error, compile_error}`
and the score is exactly 0. Defer if the UX team prefers showing
all available data.

### DBG11-2 (paired with CR11-3) — `submission-undefined` key collision in mini-bar
Same as CR11-3; recorded here so debugger ledger is complete.

### DBG11-3 — `new Date(participant.examStartedAt)` when value is already a Date
**Severity:** LOW. **Confidence:** HIGH.
**File:** `participant-timeline-bar.tsx:131-132`,
`participant-timeline-bar.tsx:134-136`

```ts
const startTime = participant.examStartedAt
  ? new Date(participant.examStartedAt)
  : (earliest ?? new Date());
```

If `participant.examStartedAt` is already a `Date` (per the type
`ParticipantTimeline["participant"]`'s field shape; need to confirm
in `lib/assignments/participant-timeline.ts`), `new Date(date)` is
fine but allocates an extra object per render. If the field is a
string/number coming through serialization, this is correct. Either
way, no bug — but `new Date(undefined)` returns Invalid Date, which
the `participant.examStartedAt ? …` guard prevents. No action.

## Carry-forward

- DBG10-1 (synthetic 1h fallback) — informational, still
  unreachable behind `!hasEvents` early-return.
- DBG10-3 (event-key collision in top bar) — LOW/LOW, deferred.

## Verdict

DBG11-1 is debatable (cosmetic). The cycle-10 fix surface
introduces no new failure modes.
