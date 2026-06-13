# Debugger — RPF Cycle 7 (2026-06-13)

**HEAD reviewed:** 0472b007. Lens executed directly by the cycle agent (fallback per cycles 1–6).
**Focus:** latent failure modes, regressions introduced by cycle-6, races in the merged-state client surfaces.

## D7-1 — Dashboard poll-merge seam loss (MEDIUM, High, CONFIRMED — same defect as CR7-2)
`anti-cheat-dashboard.tsx:125-148`. Reproduce: load page 1 (100 rows), click
"Load more" (now 200 rows in state, `offset=200`). N new events arrive
server-side. 30 s poll fires: fresh first page = newest 100 (includes the N
new + 100-N of the old first page). Merge keeps `firstPage` ++
`prev.slice(100)`. The 100-N rows that were at indices `100-N .. 99` of `prev`
are in neither slice → **gone from the reviewer's view** even though they are
still valid evidence. Failure is silent (no error, no warning). Fix: id-union
merge (AGG7-1).

## D7-2 — Dashboard loadMore duplicate rows → React key collision (LOW-MEDIUM, High, CONFIRMED)
`anti-cheat-dashboard.tsx:161-179`: `setEvents((prev) => [...prev, ...new])`
with no id-dedupe and no stale-sequence guard. After a poll merge shifts the
server list, the preserved `offset` points into a range that now overlaps
already-rendered rows → duplicate `key={event.id}` (line 577) → React "two
children with the same key" warning + duplicated evidence row. The timeline
fixed exactly this in cycle-6 (`participant-anti-cheat-timeline.tsx:145-152`);
the dashboard was missed. Fix: fetch-seq guard + id-dedupe.

## D7-3 — Stale token expiry after schedule edit produces a confusing access denial (LOW-MEDIUM, Medium, CONFIRMED — surfaces SEC7-1)
If an instructor EXTENDS a contest, a participant who holds only a
`contest_access_token` (e.g. a recruiting candidate, no separate live
enrollment edit) would be denied by every token gate during the extension
window because the token still expires at the old close. Today both creation
sites ALSO write an `enrollments` row, so the enrollment branch rescues
access — but if an operator ever removes the enrollment while keeping the
token, or for the pre-cycle-6 rows stamped with `deadline`-based expiry, the
candidate hits an inexplicable "not enrolled / forbidden" mid-window. Hard to
debug from logs because the token EXISTS but silently fails the validity
predicate. Fix: schedule-edit token-expiry sync (SEC7-1).

## Verified non-issues (checked, no bug)
- Queue-first `reportEvent`: the `await flushPendingEventsRef.current()` after enqueue cannot double-send (single-flight `isFlushingRef`); if a flush is mid-run the event waits for the ≤1 s retry timer. Crash-recovery in-flight slot replays at most one duplicate (by design). Sound.
- Heartbeat LRU eviction on insert failure (anti-cheat/route.ts:160-172): `throw` after `delete` re-surfaces the 5xx so the client retries; shared-coordination path correctly skipped. Sound.
- Worker staleness background interval: unref'd, idempotent guard (`if (sweepTimer) return`), `.catch` on the async callback — no unhandled rejection, no double-scheduling. Sound.
- `key={i}` on the dashboard loading skeleton (line 546) is a CONSTANT array rendered only while loading=true — never reordered; not a key-stability bug.

## Final sweep
No regressions from cycle-6 G1/G2/G3/G6 found. The active latent surface is
the dashboard paging pair (D7-1/D7-2) and the schedule-edit token staleness
(D7-3).
