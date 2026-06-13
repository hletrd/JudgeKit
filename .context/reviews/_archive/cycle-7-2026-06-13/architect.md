# Architect — RPF Cycle 7 (2026-06-13)

**HEAD reviewed:** 0472b007. Lens executed directly by the cycle agent (no reviewer subagents registered; fallback per cycles 1–6).
**Focus:** layering, coupling, single-source-of-truth invariants introduced by cycle-6, lifecycle-completeness of the contest-access-token model.

## A7-1 — Token-expiry invariant is owned at CREATE but not at MUTATE (MEDIUM, High, CONFIRMED)
Cycle-6 correctly centralized the token VALIDITY rule
(`CONTEST_ACCESS_TOKEN_VALIDITY_SQL` + `findValidContestAccessToken`) and the
EXPIRY-derivation rule (`contestAccessTokenExpiry = lateDeadline ?? deadline`)
in `src/lib/assignments/contest-access-tokens.ts`. That is good layering. But
the lifecycle has three mutation points and only one is wired:
- CREATE (invite route, recruiting redemption) → uses `contestAccessTokenExpiry` ✓
- ROSTER-REMOVE → `revokeContestAccessTokensForGroup` ✓
- **SCHEDULE-EDIT** (`updateAssignmentWithProblems`, management.ts:291-309) → **NOT wired**: the assignment's `deadline`/`lateDeadline` can change after tokens exist, but no code re-derives token expiry. The invariant the module documents ("token expiry = effective close") is therefore violated by a normal instructor action.
This is an architecture gap, not just a bug: the module is positioned as the
single owner of the lifecycle, so the sync belongs THERE (a
`syncContestAccessTokenExpiry(tx, assignmentId, assignment)` helper) and must
be called from the same transaction that mutates the schedule — the same
pattern as `revokeContestAccessTokensForGroup` being called inside the
member-removal tx. Detail in SEC7-1 / CR7-3.

## A7-2 — Two divergent client paging implementations for the SAME anti-cheat GET (LOW-MEDIUM, High, CONFIRMED)
`anti-cheat-dashboard.tsx` and `participant-anti-cheat-timeline.tsx` both
consume `GET /contests/[id]/anti-cheat` with poll-reset + loadMore, but have
DIVERGED: the timeline got the fetch-sequence guard + id-dedupe in cycle-6
G4; the dashboard did not (CR7-2). Two copies of subtly-different paging glue
is a maintenance hazard — the next fix to one will miss the other (it already
happened this cycle). **Recommendation:** after fixing the dashboard
(AGG7-1), extract the shared "poll-reset-aware infinite list" logic into a
hook (e.g. `usePolledOffsetList`) so the two views cannot drift again. Note:
the hook extraction itself is a refactor beyond the review findings — schedule
only the dashboard FIX this cycle; record the extraction as an architecture
note, not a deferred finding (it is a new idea, not an existing finding).

## Clean / sound
- Pure-vs-DB split for worker staleness (`worker-staleness.ts` predicates DB-free; `worker-staleness-sweep.ts` DB-backed) is correct and keeps the predicate unit tests cheap.
- `getEffectiveExamCloseAt` single-owner contract (exam-close.ts) consumed by both the submit validator and the anti-cheat ingest — no drift.
- Route files remain leaves (no lib imports a route); the cycle-4 AGG4-7 client-events extraction holds.
- API handler factory + capability cache keep authz centralized.

## Final sweep
No new circular deps, no layering inversions introduced by cycle-6. The one
real architectural debt this cycle is A7-1 (complete the lifecycle ownership);
A7-2 is a divergence to converge after the functional fix.
