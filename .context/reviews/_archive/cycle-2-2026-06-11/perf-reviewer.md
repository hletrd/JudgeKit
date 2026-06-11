# Perf Reviewer — RPF Cycle 2 (2026-06-11)

**HEAD reviewed:** 4cf01035 (main)
**Scope:** hot paths (submit, claim, SSE, catalog pages), cycle-1's perf
changes, retention jobs, dashboard fetches.

## Findings

### PERF2-1 — `code_snapshots` grows without bound (MEDIUM, High confidence — shared with SEC2-2)
Every active examinee posts a snapshot every 10 s while typing (60 s idle),
≤256 KiB/row (`problem-submission-form.tsx:140-182`), and nothing ever
deletes rows. A 100-seat 2-hour exam adds up to ~70k rows; a year of courses
makes the `cs_user_problem_idx` and timeline queries progressively slower and
the DB volume grows monotonically. Fix: retention prune keyed on `createdAt`
(index already exists), batched like the existing `batchedDelete`.

### PERF2-2 — ipOverlap report fetch per dashboard mount (INFO, verified acceptable)
`anti-cheat-dashboard.tsx:208-228` fetches the report once per mount (not on
the 30 s poll) — deliberate and fine. The UNION CTE is assignment-scoped and
hits `ace_assignment_user_idx` / exam_sessions PK; LIMIT 100 on both arms.
No action.

### PERF2-3 — Rate-limit conflict-500 wastes a request round-trip (LOW)
Same defect as CR2-2; perf angle: the aborted transaction forces the client
into a retry it should never need on the first-use path. Fix as CR2-2.

## Verified-good
- **Cycle-1 F3 (catalog numbers in SQL)** delivers the intended win: both
  pages now transfer ≤ PAGE_SIZE ranked rows instead of the whole catalog id
  list per view (`src/lib/problems/catalog-numbers.ts`); `row_number()` runs
  over the scope filter with the existing order, and the outer
  `inArray(ids)` keeps the result tiny.
- **Cycle-1 F1/AGG-5 deslop**: submit hot path kept the single parallel
  enrollment+examSession round trip (`submissions.ts:229-242`), now hoisted
  before the schedule checks (one extra read on reject paths — accepted and
  commented).
- **Settings double-fetch removed** (5e14fdf9): `getEffectiveModeRestrictions`
  accepts a preloaded settings record; both AI-flag resolvers pass it.
- SSE connection tracking remains O(1) per add/remove with two-phase eviction
  (`submissions/[id]/events/route.ts:38-72`); ARCH-CARRY-2 (>500-conn
  eviction behavior) carries with unchanged preconditions.
- Draft autosave write load remains bounded (3 s debounce + per-user rate
  limit) — P3 monitoring note carries.

## Carried (unchanged preconditions, see cycle-1 register)
- CR2/P2 claim-route per-claim scoringModel SELECT (~1 ms; fold into next
  claim-SQL change).
- P3 draft-autosave contest write load (watch p95 during first live contest).
