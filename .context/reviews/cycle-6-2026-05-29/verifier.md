# Cycle 6 — Verifier review (evidence-based correctness)

**HEAD:** d1217b5a · Baseline: lint 0/0, tsc 0, build 0, 2459 tests / 320 files, lint:bash 0 (re-run this cycle, all green).

## Verified claims

1. **`offline` is set on only 2 paths.** `grep -rn offline src/app/api/v1/judge src/lib/judge` returns only `deregister/route.ts:63`. Admin DELETE *deletes* the row (`workers/[id]/route.ts:99`), it does not set offline. CONFIRMED: no `stale -> offline` reaper exists. → N6-C6 is a confirmed gap, HIGH confidence.

2. **`admin-health` trips degraded on any stale worker.** `admin-health.ts:89`: `stale > 0 => "degraded"`. CONFIRMED. Combined with (1), a single crashed worker pins health degraded permanently.

3. **`judge_workers.status` is free-text with `judge_workers_status_idx`.** `schema.pg.ts:430,444`. The reaper can set `status='offline'` with no enum migration. `deregisteredAt` column exists (line ~441). CONFIRMED safe to write the terminal state from the sweep.

4. **N1 active_tasks reset cutoff == proposed reap cutoff.** `heartbeat/route.ts:102-115` uses `computeActiveTasksResetCutoff(now, staleClaimTimeoutMs)` and `status='stale'`. The reap predicate is identical, so combining the two UPDATEs into one (`offline + deregisteredAt + active_tasks=0`) PRESERVES N1 behavior exactly (a reaped row gets active_tasks=0; rows past the stale-status floor but within the reset cutoff keep their active_tasks AND stay stale). VERIFIED no regression to N1's no-clobber-recent-stale guarantee.

5. **F3/F4/N3 trust + perf preconditions unchanged.** No untrusted workers introduced; no DB profiling added. Deferrals remain valid.

## Risks needing manual validation
- After combining, confirm the worker-staleness unit suite still passes (the `shouldResetActiveTasks` predicate is unchanged; a new `shouldMarkOffline` is the same cutoff). Add reaper-specific assertions.
- E2E admin-workers spec is login-gated (pre-existing smoke-cred issue, cycles 1-5); not a regression vector for this change.
