# Performance Reviewer — RPF Cycle 5 (2026-06-11)

**HEAD:** 04b8c1ec. Focus: anti-cheat read paths (the deferred AGG4-5 area),
cycle-4's client flush loop, similarity engine, submissions hot path,
judge claim contention.

## P5-1 — The 5000-row heartbeat-gap scan runs on every participant-timeline poll and is discarded (MEDIUM, High, CONFIRMED)
`anti-cheat/route.ts:287-321` runs the per-user gap scan whenever `userId` is
present. `participant-anti-cheat-timeline.tsx:97` polls the route with
`userId=` on a visibility-driven interval — so the scan executes on every
poll — and the component **never reads `heartbeatGaps`** (no consumer exists
anywhere in `src/`). This is the worst combination: the deferred AGG4-5 read
cost is being PAID on a hot polling path while producing zero user value.
Fix shape: gate the scan behind an explicit `includeGaps=1` query param and
have the (new, see SEC5-3/IN5-2) gap UI pass it; polls that only want the
event table skip the scan entirely. This also satisfies the AGG4-5 deferral's
exit criterion ("the next cycle that edits the anti-cheat GET") — the
unconditional `count(*)` (`:279-282`) stays, as it feeds pagination `total`
and runs on an indexed, assignment-scoped predicate.

## P5-2 — Claim-loop storage churn is acceptable (verified, no action)
Cycle-4's per-event claim loop (`anti-cheat-monitor.tsx:105-128`) does
O(n) JSON parse/serialize per event per flush. With `MAX_PENDING_EVENTS=200`
(`anti-cheat-storage.ts:26`) the worst case is ~200 parses of a ≤200-element
array — sub-millisecond each on exam hardware. No action.

## P5-3 — Similarity TS fallback yields correctly; route timer leak is negligible (LOW)
`code-similarity.ts:296-305` yields the event loop every 8 ms via monotonic
clock — verified sound. The route's leaked `setTimeout` on the non-abort
throw path (`similarity-check/route.ts:30-35`) costs one no-op callback;
fix alongside CR5-3 for hygiene, not perf.

## P5-4 — Submissions POST hot path — verified, no regressions
The cycle-4 probe is correctly scoped to the submit path only (one extra
indexed `LIMIT 1` lookup on `ace_assignment_user_idx`; render/autosave pay
nothing). Advisory-lock serialization per user bounds contention to the
submitting user. `count(*) over()` pagination avoids the second count query.
No new findings.

## P5-5 — Judge claim under contest load — verified (provenance)
`buildClaimSql` takes one `FOR UPDATE SKIP LOCKED` candidate per call;
worker capacity is checked in the same statement (no thundering herd on a
single row). The background staleness sweep self-heals counter leaks. The
documented two-worker deadlock-and-retry case is accepted and self-recovering.
No new findings.
