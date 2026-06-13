# Perf Reviewer — RPF Cycle 7 (2026-06-12)

**HEAD reviewed:** 0472b007. Lens executed directly by the cycle agent (fallback per cycles 1–6).
**Inventory:** polling surfaces (visibility-polling consumers), anti-cheat GET hot path, leaderboard/scoring SQL, judge claim/heartbeat, pagination depth costs, client merge logic, background sweeps.

## P7-1 — Anti-cheat GET recomputes `count(*)` + (optionally) a 5000-row gap scan on every 30 s poll per open viewer (LOW, Medium, RISK — deferral candidate)
`src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:296-299` runs a
full-filter `count(*)` for every poll; with `includeGaps=1` (participant
timeline) lines 313-322 add a 5000-row heartbeat fetch. With many staff
viewers open during a large live contest this multiplies. Mitigations already
in place: gap scan is opt-in + userId-gated (cycle-5 AGG5-3), limit cap 500,
30 s poll with visibility pause and jitter. Acceptable today on the
documented single-DB topology; becomes relevant only at much larger viewer
counts. **Recommendation:** revisit if a live event shows DB CPU from this
query family; cheap option then is approximating total via `events.length +
hasMore` or caching the count for 30 s per (assignment, filters).

## P7-2 — Dashboard poll-merge fix (AGG7-1) should stay O(page) (note for the implementer)
The id-union merge for `anti-cheat-dashboard.tsx` must build the seen-set from
the FRESH first page (≤100 ids) and filter `prev` once — not nested includes.
The timeline's dedupe (`participant-anti-cheat-timeline.tsx:149-152`) already
uses a Set; mirror it.

## Clean checks
- `useVisibilityPolling` (src/hooks/use-visibility-polling.ts): pauses when hidden, recursive setTimeout (no catch-up bursts), 0-500 ms jitter on refocus — good herd behavior for classroom-sized refocus storms.
- Queue-first `reportEvent` (anti-cheat-monitor.tsx:199-230): single-flight + claim loop bounded by initial queue length; backoff capped; no tight-loop risk. Heartbeats are deduped server-side per 60 s (LRU / shared coordination) — queue-first does not increase row volume.
- Worker staleness sweep: two indexed UPDATEs once per 60 s process-wide + per-heartbeat; negligible.
- Leaderboard: per-assignment ranking cache with explicit invalidation on edits (`invalidateRankingCache`, assignment PATCH route:222); single-user live-rank avoids full board recompute.
- Submit hot path: cycle-6 G1 kept the parallel fetch pair (enrollment+session) and adds at most ONE extra indexed token lookup only when enrollment is absent (submissions.ts:329).
- Offset pagination depth cost (OFFSET n scans n rows): all paged tables are bounded in practice (events per assignment, admin lists); cursor mode exists where it matters (submissions). No action.

## Final sweep
No unbounded queries, no N+1 introduced by cycle-6, no missing `limit` on list endpoints found. The only standing perf deferral (P6-1, TS similarity fallback time-slicing) remains valid — its exit criterion (edit to `runSimilarityCheckTS`) has not fired this cycle.
