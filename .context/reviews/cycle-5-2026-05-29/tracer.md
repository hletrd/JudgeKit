# Tracer — Cycle 5 (2026-05-29)

Causal tracing of the worker-crash flow with competing hypotheses.

## Trace: worker crashes mid-judging
1. Worker W at active_tasks=k/concurrency=k, judging submissions S1..Sk (status
   `judging`, judge_worker_id=W, judge_claimed_at=t0).
2. W is SIGKILLed. No deregister fires (deregister is a graceful SIGTERM handler in
   main.rs; SIGKILL/OOM/host-loss skips it).
3. Sibling worker V heartbeats; sweep marks W `stale` after 90 s (heartbeat sweep).
   `active_tasks` of W untouched → still k.
4. After the 300 s stale-claim timeout, S1..Sk become eligible again
   (claim/route.ts:193-195 stale branch); V (or a restarted W') claims them,
   incrementing V's/W''s own active_tasks. W's counter stays k forever.

### Hypothesis A — self-lockout of W (REJECTED)
Would require W to keep its row and have active_tasks block its own future claims.
REJECTED: W restarts via register → NEW row, active_tasks=0 (main.rs:233,
register/route.ts:49). W' is unencumbered.

### Hypothesis B — phantom capacity steals scheduling from live workers (REJECTED)
Would require the scheduler to consult the stale row's active_tasks. REJECTED: the
claim CTE filters `status='online'` (claim/route.ts:182); stale rows are invisible
to scheduling.

### Hypothesis C — sticky degraded health + orphan-row accumulation (CONFIRMED)
`admin-health.ts:89` degrades on `stale>0` with no reaper to clear it; register
INSERTs grow the table unbounded across restarts. CONFIRMED as the real causal
chain. This is N1's actual blast radius — operational, not a scheduling/data bug.

## Conclusion
The only live causal harm is operational (health signal + table growth). The fix
that breaks the chain at step 3/4: zero active_tasks (and/or move to `offline`)
when a row is stale past the stale-claim timeout. Severity Low-Medium.
