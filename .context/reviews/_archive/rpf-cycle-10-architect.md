# RPF Cycle 10 — Architect

**Date:** 2026-04-29
**HEAD:** `6ba729ed`

## NEW findings (current cycle-10)

**0 HIGH, 0 MEDIUM, 0 LOW NEW.**

## Architecture posture at HEAD

- **deploy-docker.sh:** 1098 lines (cycle-9 +10 head-comment trigger-trip record). 1500-line file-size trigger not yet hit. Touch counter 3 (cycles 5/6/8) — cycle-9 trigger-trip record was a head-comment edit, NOT an SSH-helpers touch, so counter unchanged. Recommendation stands: when next SSH-helpers touch occurs, schedule modular extraction.
- **API handlers:** 84/104 use `createApiHandler`; 20 raw remain (ARCH-CARRY-1 MEDIUM, deferred). No incremental conversion in cycle 9.
- **Rate-limit modules:** 3-module duplication (api-rate-limit.ts 304 lines, in-memory-rate-limit.ts 165 lines, plus the user-facing API surface) preserved with cycle-8 cross-reference orientation comments. C7-AGG-9 carry-forward.
- **Encryption module:** plaintext-fallback path retained with cycle-9 head-JSDoc warning. C7-AGG-7 carry-forward.
- **SSE coordination:** O(n) eviction preserved. ARCH-CARRY-2 carry-forward.
- **auth/config.ts:** untouched (CLAUDE.md rule).

## Cycle-10 architectural recommendation

**No new architectural action required this cycle.** The cycle-10 plan should focus on:
1. LOW backlog draw-down (2-3 doc-mitigation/housekeeping items, per orchestrator directive).
2. Possibly a well-scoped MEDIUM (AGG-2 Date.now caching is the most surgical: 6 call sites in 1 file; or ARCH-CARRY-1 exemplar conversion of 1-2 raw handlers to demonstrate the pattern).
3. Plan housekeeping: archive stale duplicate plans in `plans/open/`.

## Backlog architectural inventory (status unchanged)

| Item | Type | Owner | Path |
|---|---|---|---|
| C3-AGG-5 | extract bash module | deploy | deploy-docker.sh SSH-helpers (touch counter 3, trigger met) |
| ARCH-CARRY-1 | refactor 20 raw handlers | api | src/app/api/**/route.ts |
| ARCH-CARRY-2 | SSE eviction | realtime | src/lib/realtime/realtime-coordination.ts |
| C7-AGG-9 | rate-limit consolidation | security | src/lib/security/{api-,in-memory-,}rate-limit.ts |

## Confidence

H: no new architectural concerns at HEAD.
H: cycle-9 doc-only changes do not alter architecture.
M: C3-AGG-5 trigger met but touch counter 3 unchanged; modular extraction can wait one more cycle or trip on the next SSH-helpers edit.

## Files reviewed

- `git diff 1bcdd485..6ba729ed --stat`
- `deploy-docker.sh` head + line count
- `src/app/api/**/route.ts` createApiHandler usage census (84/104)
- `src/lib/security/{api-,in-memory-}rate-limit.ts`, `encryption.ts`
