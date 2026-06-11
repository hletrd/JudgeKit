# Debugger review — RPF cycle 4 (2026-06-11)

**HEAD reviewed:** 7c0a4bd4 · baseline gates green.
**Lens:** latent bug surface, failure modes, regressions.

## Findings

### D4-1 — Guaranteed false escalate flag on first problem open (MEDIUM-HIGH, High, CONFIRMED)
Reproduction (from code, no environment needed):
1. Windowed exam, `enableAntiCheat: true`. Student starts the session
   (start-exam-button → `startExamSession`).
2. Student opens problem 1: `practice/problems/[id]/page.tsx:167` calls
   `validateAssignmentSubmission` during render.
3. Validator path: schedule OK → enrollment OK → session OK → heartbeat
   correlation (`submissions.ts:319-335`): zero `anti_cheat_events` rows exist
   (the monitor mounts only after this render and after privacy-notice
   acceptance) → `latestEventAt === null` → `fresh === false` → INSERT
   `submission_stale_heartbeat` (escalate tier).
Result: every participant of every anti-cheat exam starts flagged. Repeats per
problem navigation whenever >90 s passed without a recorded event (e.g. student
sat on the contest overview page, which mounts no monitor).

### D4-2 — Flag self-suppression window (MEDIUM, High, CONFIRMED)
Because the freshness probe (`submissions.ts:320-330`) matches ANY event type,
the row inserted by D4-1/the real submit path satisfies the next probe for
~90 s. Failure mode: the SECOND unmonitored submission inside 90 s is NOT
flagged — the evidence trail under-counts in bursts, which is precisely when a
confederate-typed exam ends (rapid-fire final submissions).

### D4-3 — Lost-update race in the anti-cheat pending queue (LOW-MEDIUM, Medium, LIKELY)
`anti-cheat-monitor.tsx`: interleaving
`performFlush` (async; load at `:91`, save at `:103` after awaits) with
`reportEvent`'s synchronous load-push-save (`:165-167`) drops the appended
event. Trigger: blur/copy event fires while a flush (mount, refocus, online)
is mid-await. Also two overlapping flush loops can double-send the same queued
event (both load the same list before either saves). Impact: missing or
duplicated telemetry rows — duplicates are merely noise, but missing
`tab_switch` rows weaken evidence. Deterministic fix: per-event claim loop +
`isFlushing` ref (see perf P4-3).

### D4-4 — Misleading `assignmentClosed` from session re-fetch race (LOW, High, CONFIRMED)
`exam-sessions.ts:101-110`: if the post-insert re-fetch misses, the student is
told the assignment is closed even though it is open; they will not retry
(the UI gates on that error). Rename to an internal error so the UI shows the
retryable generic failure instead.

## Hypotheses tested and rejected (provenance)
- "PATCH lets exams keep a late window, diverging the anti-cheat ingest from
  submission acceptance": rejected — PATCH merges into
  `assignmentMutationSchema` (`[assignmentId]/route.ts:129`), which nulls
  `lateDeadline` for both exam modes (`validators/assignments.ts:107-122`).
- "Heartbeat-only-when-visible starves freshness during legit work": rejected —
  any visible exam tab heartbeats every 30 s; server records ≤1/60 s; the 90 s
  threshold leaves ≥30 s margin. The starved cases are exactly the
  non-submission paths covered by D4-1.
- "Cycle-3 lazy staff resolution changed student fallback semantics": rejected —
  non-staff `?userId=other` still resolves (now lazily) and self-falls-back;
  pinned by `exam-session-get-lazy-staff.test.ts`.
- "`getEffectiveExamCloseAt(now > close)` vs old `>= now` boundary flip":
  rejected — old accept condition `personalDeadline >= now` ≡ new reject
  condition `effectiveClose < now` at the boundary.

Confidence labels inline.
