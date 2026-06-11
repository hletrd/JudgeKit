# Debugger — RPF Cycle 10 (2026-05-16)

**Cycle:** 3/100 of this RPF loop
**HEAD reviewed:** `23dd9e80`

## Latent failure modes examined

### DBG10-1 — `Math.max(endTime - startTime, 1)` masks data-quality issues
**Severity:** LOW · **Confidence:** MEDIUM
**File:** `src/components/contest/participant-timeline-bar.tsx:137`

When `participant.examStartedAt` is missing AND `personalDeadline`
is missing AND there are no events, the fallback is `startTime ==
new Date()` and `endTime == new Date(startTime + 3600_000)`. The
bar then renders for a one-hour synthetic window starting "now",
which would only ever happen during a debug navigation. Not a
runtime bug; the `!hasEvents` early-return at line 156 handles the
no-events case. CONFIRMED safe but worth a comment.

### DBG10-2 — `formatDuration` negative-second clamp absent
**Severity:** LOW · **Confidence:** HIGH
**File:** `src/components/contest/participant-timeline-bar.tsx:144-152`

If `ev.at.getTime() < startTime.getTime()` (e.g. submission before
exam start, possible when admin retroactively starts an exam),
`Math.floor((ev.at.getTime() - startTime.getTime()) / 1000)` is
negative. `formatDuration(-5)` returns `"0m -5s"`. The percentage
clamp at line 141 already handles bar positioning; the duration
display does not.

**Fix:** `Math.max(0, totalSeconds)` at the top of `formatDuration`,
or branch in the caller.

### DBG10-3 — Tooltip key collision on simultaneous events
**Severity:** LOW · **Confidence:** LOW
**File:** `src/components/contest/participant-timeline-bar.tsx:208`

Key `${problemId}-${type}-${at.getTime()}`. Two snapshots on the
same problem inserted by a buggy client in the same millisecond
would collide. PostgreSQL `now()` is microsecond-resolution but
`Date` from JSON is millisecond-resolution. In practice the
auto-save snapshot interval is seconds, so collision is implausible.

**Status:** Informational.

## No-issue audits

- `getParticipantTimeline` transaction (single `tx`): all 8 queries
  share consistent snapshot semantics; rate-limit at the route
  level (`createApiHandler`) bounds 5000-submission, 1000-snapshot
  query budget.
- `mapSubmissionPercentageToAssignmentPoints` invoked in
  `participant-timeline.ts:240-251`: handles late penalty
  consistently with leaderboard. CONFIRMED.

## Verdict

Two LOW informational items (DBG10-1, DBG10-3) + one LOW
defensive-display fix (DBG10-2). No regressions.
