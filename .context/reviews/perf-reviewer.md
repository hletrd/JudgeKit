# Perf Reviewer — RPF Cycle 1 (2026-06-11)

**HEAD reviewed:** f977ef4c (main)
**Scope:** 76-commit delta since 24939e42; depth on post-804c8db3 commits.

## Findings

### P1 — Full-catalog ID fetch on every /problems and /practice page view (MEDIUM, confidence High)
Commit f977ef4c (`src/app/(public)/problems/page.tsx:469-482`,
`src/app/(public)/practice/page.tsx:538-549`) computes the "stable per-problem
number" by SELECTing the id of **every visible problem** (no LIMIT) on **every
page load**, then building a JS `Map` of the whole catalog — to label the ~20
rows actually displayed. Two server pages, every paginated request, every
user. With a 10k-problem catalog that is a 10k-row transfer + 10k-entry Map
per view; today (~1–3k problems) it is measurable but not critical — this is
exactly the query-shape the same cycle's M4 fix (84c55ce7) removed from
contest analytics.
**Fix:** compute the rank in SQL and fetch it only for the page's rows:
`SELECT id, row_number() OVER (ORDER BY sequence_number ASC, created_at ASC) rn
FROM problems WHERE <same filter>` as a subquery, outer-filtered by
`id IN (<page ids>)`. Transfers ≤ PAGE_SIZE rows; identical numbering
semantics. (Note: `/problems` Path B already had a full-ID fetch for the
progress filter — pre-existing, different purpose; this finding is about the
NEW unconditional scan.)

### P2 — Claim path +1 query per claim (LOW, confidence High)
`claim/route.ts:330-337` — separate `assignments.scoringModel` SELECT per
claim instead of a join in the claim SQL. ~1 ms per claim; the claim rate is
bounded by judge throughput. Not actionable alone; fold into the carried
claim-consolidation deferred item (F3/F4 cluster).

### P3 — Draft autosave write load during contests (INFO/LOW, confidence Medium)
`use-server-source-draft.ts` PUTs at most once per 3 s debounce per active
editor; each PUT is a single-row upsert. With N concurrent contestants worst
case ≈ N/3 writes/s (typing continuously). For the documented scale (hundreds
of users) this is fine; the per-user rate limit caps abuse. Flag only because
contest start is the platform's load spike moment; if p95 DB latency during a
live contest degrades, this is the first new write source to inspect.
Monitoring note, not a defect.

## Verified sound (no finding)
- **M4 contest analytics** (84c55ce7): first-AC via `DISTINCT ON`, progression
  via bounded window — the unbounded all-submissions scan is gone. Verified in
  `src/lib/assignments/contest-analytics.ts`.
- **H5 reply counts** (90558b22): `COUNT(*) GROUP BY thread_id` batched —
  eager post fetch removed from all 4 list functions.
- **Output cap / compile limits** (f44baab6, 86999c13): env-configurable with
  unchanged defaults; worker RAM worst case now operator-tunable.
- **Staleness sweep**: one 60 s interval per process; two indexed UPDATEs
  (status + last_heartbeat_at indexes exist, schema.pg.ts:444-445). Negligible.
- **prev_worker_release**: touches at most 1 extra row per claim. Negligible.
- Per-claim IOI flag adds no per-test-case overhead; the run-all cost for IOI
  is inherent to correct partial scoring (the C1 trade-off was explicitly
  accepted in the plan).

## Concurrency / shared state
- `sweepStaleWorkers` is safe to run concurrently with the heartbeat-route
  sweep (status-conditional UPDATEs are idempotent; both use DB time).
- Cross-worker reclaim lock ordering: see debugger D1 (rare deadlock, LOW).

## Final sweep
Grepped the delta for new N+1 loops (`for ... await db.` — none added), new
unbounded `findMany` (none), new `JSON.parse` on hot paths (none), client
re-render hazards in the new hook (refs used; effects keyed correctly). Done.
