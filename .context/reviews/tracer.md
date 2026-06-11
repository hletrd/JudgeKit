# Tracer — RPF Cycle 5 (2026-06-11)

**HEAD:** 04b8c1ec. Causal traces of the anti-cheat evidence chain end-to-end,
with competing hypotheses resolved by code evidence.

## Trace 1 — Lifecycle of a `submission_stale_heartbeat` flag
PATH: submit POST → `validateAssignmentSubmission(opts.recordStaleHeartbeatFlag
=true)` → probe (`submissions.ts:348-363`, client-event-filtered, DB-time) →
INSERT flag (`:372-390`) → **then** assignmentProblem check (`:395`) → return
to route → `canAccessProblem` (`route.ts:280`) → tx: advisory lock → rate
limits → exam expiry → INSERT submission (`:364-374`).
FINDING: five rejection exits occur AFTER the flag insert. The flag's
documented meaning ("submission accepted while monitor stale") holds only on
the single fully-successful path. Hypothesis "the tx rollback also rolls the
flag back" — REJECTED: the flag insert uses `db`, not `tx`, and precedes the
transaction entirely. Hypothesis "rate-limited requests never reach the
validator" — REJECTED: the in-tx rate limit runs after validation by design
(advisory-lock serialization). Conclusion: move the recording after the
accept point (CR5-1/SEC5-1/D5-1).

## Trace 2 — Where does `heartbeatGaps` go?
PRODUCER: `anti-cheat/route.ts:286-321` (userId-filtered GETs only).
CONSUMERS: `grep -rn heartbeatGaps src` → only the route itself.
`participant-anti-cheat-timeline.tsx` issues exactly the userId-filtered GET
(`:97`) on a poll loop and types the response WITHOUT the field. Conclusion:
computed-and-discarded on a hot path (P5-1); the one screen built for
per-participant review cannot show absence periods (D5-3). No competing
hypothesis survives — the field was wired server-side (cycle-1 era) and the
UI half never landed.

## Trace 3 — Pending-event queue across the unload boundary
reportEvent (sync enqueue on "retry") → performFlush claim loop: load → save
queue-minus-head (CLAIM, `:113-114`) → await send → on "retry" reload+append.
Interleavings checked: (a) reportEvent append during await — preserved
(re-load before requeue; sync blocks can't interleave in JS) ✓; (b) second
flush trigger — `isFlushingRef` single-flight ✓; (c) retry-timer + manual
flush — `!retryTimerRef.current` dedup ✓; (d) **unload between claim and
result — the event is gone from storage and from memory** ✗ (SEC5-2/D5-2).
The cycle-4 redesign traded duplicate-on-crash for loss-on-crash; for
evidence telemetry the trade should be reversed via an in-flight slot.

## Trace 4 — Similarity "reason" propagation
`runSimilarityCheck` returns `service_unavailable` for BOTH "sidecar down"
and "too many rows for TS fallback" (`code-similarity.ts:374-383`);
`too_many_submissions` is declared (`:241`) but unreachable. UI branch for it
exists (`anti-cheat-dashboard.tsx:317-323`) with a translated message —
dead. The operator-facing diagnosis for a >500-submission contest with a
down sidecar is therefore misleading-by-merger. LOW; fix in the lib.

## Trace 5 — Cycle-4 regression sweep (CLEARED)
`client-events.ts` single source: route zod enum + validator probe filter
both import it; the pin test guards equality. `examSessionUnavailable` falls
through the start-exam route switch to the generic retryable 500 (no
`assignmentClosed` mislabel). Render/autosave callers pass no options →
probe-free, write-free (verified by reading both call sites). No regressions
found in the cycle-4 surface beyond the rejected-submit hole (Trace 1).
