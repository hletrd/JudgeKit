# architect — RPF Cycle 10 (2026-06-13)

**HEAD:** 03125b44 (clean tree).

## Findings
**No new actionable architectural findings.**
- The listing-order invariant is now enforced by a single source-of-truth contract test covering all paged listings — a good cross-cutting invariant gate. The sweep that began cycle-6 (submissions) → cycle-7 (7 siblings) → cycle-9 (3 stragglers) is complete and self-policing.
- Module boundaries are clean: scoring/leaderboard SQL is centralized (`contest-scoring.ts`, `leaderboard.ts`, shared `buildIoiLatePenaltyCaseExpr`); exam lifecycle in `exam-sessions.ts`; auth/authz behind dedicated helpers.
- Deploy architecture honors the app-only vs. worker-host split (algo = app-only; worker-0 = judge images), encoded in `.env.deploy.*` and AGENTS.md.

## Standing structural debts (carried, no exit criterion fired)
- C3-AGG-5: `deploy-docker.sh` SSH-helper extraction (1433 lines) — no SSH/remote-exec plumbing touched this cycle. Carry.
- AGENTS.md Step 5b backfill sunset (target 2026-10-26) — not yet due. Carry.
No High/Medium architectural risk is open.
