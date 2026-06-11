# Perf Reviewer — RPF Cycle 3 (2026-06-11)

**HEAD reviewed:** 63429d97. Focus: steady-state load introduced by cycle-2 features, hot-path query counts, and verification of cycle-1/2 perf claims.

## Findings

### PERF3-1 — New 60 s exam-session poll pays ~5–6 queries/poll, most of it avoidable for plain students (LOW-MEDIUM, High, CONFIRMED)
`src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-session/route.ts:93-131` (GET), polled every 60 s + every tab refocus by `ExamDeadlineSync` for EVERY active windowed examinee. Per poll: `canAccessGroup` (1–2 queries), assignment `findFirst` (1), **`canViewAssignmentSubmissions` (2–3 queries — group/instructor/TA resolution)**, `getExamSession` (1). The `canViewAssignmentSubmissions` resolution is only consumed when `?userId=` is present (staff querying another participant) — students never send it. With 300 concurrent examinees that is ~900–1,000 wasted queries/min at exactly the moment the DB is also absorbing submissions and anti-cheat events. Fix: resolve `canViewOthers` lazily — only when `userId` param present and ≠ `user.id`. Saves ~40 % of the poll's query budget with zero semantic change. (Also flagged by code-reviewer CR3-4.)

### PERF3-2 — Anti-cheat retry queue does sequential awaited sends including permanently-dead 4xx events (LOW, Medium, CONFIRMED)
`src/components/exam/anti-cheat-monitor.tsx:75-88` — `performFlush` awaits each `sendEvent` serially; when the queue holds 403-rejected events (see CR3-1 interplay) they burn 3 retries × backoff each before being dropped, head-of-line-delaying real events behind them. Dropping permanent 4xx rejections immediately (CR3-2 fix) also fixes the queue-latency profile. Sequential sending itself is fine at these volumes (events are rare); no parallelization needed.

### PERF3-3 — ipOverlap report query shape is index-aligned (verified, no action)
`src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:193-231`: both CTE legs filter on `assignment_id` (covered by `ace_assignment_user_idx` / `es_*` indexes, schema.pg.ts:1176-1178); DISTINCT collapses heartbeat volume before the joins; both outer queries LIMIT 100. For a 500-examinee contest with ~8 h of 60 s heartbeats (~240 k rows) this is a single-digit-ms index scan + hash agg. Acceptable as an on-demand staff view; no caching needed.

## Verified perf claims from cycles 1–2 (evidence-based)
- AGG-3 catalog ranking: `/problems` + `/practice` no longer fetch every visible id per view — `getCatalogNumbersForIds` transfers ≤ PAGE_SIZE rows (`src/lib/problems/catalog-numbers.ts`, real-Postgres integration test present). Confirmed in source; the old full-scan code is gone.
- 5e14fdf9 settings double-fetch: submit-path checks re-parallelized; `getConfiguredSettings()` is sync-cached. Confirmed.
- `sweepStaleWorkers` background interval (60 s) is two indexed UPDATEs on a table with ~1 row per worker — negligible.
- Rate-limit conflict-safe insert adds zero queries to the happy path (insert was already there); the lost-race path adds one re-read inside the same tx. Fine.
- `ExamDeadlineSync` interval is ≥60 s with in-flight dedup and no backoff storm on failure (errors keep the current deadline silently). Client side is well-behaved; the cost concern is server-side (PERF3-1).

Final sweep: no N+1 or unbounded-fetch patterns introduced by the cycle-1/2 diffs; remaining known hotspots are unchanged and carried in the register (C7-AGG-9 consolidation, etc.).
