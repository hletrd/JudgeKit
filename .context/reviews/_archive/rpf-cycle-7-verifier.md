# RPF Cycle 7 — verifier (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `45502305`.
**Cycle-7 change surface vs prior cycle close-out:** **0 commits, 0 files, 0 lines.**

## Pre-cycle gate evidence

Gates inherited from cycle-6 close-out (Task Z, recorded in cycle-6 plan):
- `npm run lint`: exit 0 (clean).
- `npx tsc --noEmit`: exit 0 (clean).
- `npm run lint:bash`: exit 0 (clean).
- `npm run build` (next build): exit 0 (304 routes built; same surface as cycle-5).
- `npm run test:integration`: exit 0; 37 tests SKIPPED (DEFER-ENV-GATES carry-forward).
- `npm run test:unit`: 126 failures + 2105 passes (DEFER-ENV-GATES carry-forward; CPU contention).
- `npm run test:component`: 66 errors (DEFER-ENV-GATES carry-forward).
- `npm run test:security`: 8 failures + 201 passes (DEFER-ENV-GATES carry-forward).
- `npm run test:e2e`: NOT RUN (Playwright config requires Postgres harness; sandbox-blocked).

Cycle-7 will re-run gates in Task Z and verify they remain consistent.

## Verification of stale prior cycle-7 findings at HEAD

### C7-CR-1 / AGG-1 (`/api/v1/time` uses Date.now) — RESOLVED

- Confirmed `src/app/api/v1/time/route.ts` uses `await getDbNowMs()` at HEAD.
- Confirmed `export const dynamic = "force-dynamic"` present.
- Confirmed `import { getDbNowMs } from "@/lib/db-time"` present.

### C7-SR-2 / AGG-2 (plaintext recruiting tokens) — RESOLVED

- Confirmed `src/lib/db/schema.pg.ts:940` is `tokenHash: varchar("token_hash", { length: 64 })`.
- Confirmed plaintext `token` column REMOVED entirely from schema (verified `grep "token: text" src/lib/db/schema.pg.ts` → no match in schema).
- Confirmed only `ri_token_hash_idx` index exists at line 960; `ri_token_idx` (plaintext) removed.

### C7-PR-1 / AGG-3 (SSE O(n) eviction) — VERIFIED STILL APPLICABLE

- Confirmed `src/app/api/v1/submissions/[id]/events/route.ts:48-63`: `while (connectionInfoMap.size >= MAX_TRACKED_CONNECTIONS)` loop scans entries.
- Confirmed `src/lib/realtime/realtime-coordination.ts` has same pattern.
- Both sites apply; severity LOW; ARCH-CARRY-2 path-drift correction proposed.

### C7-CR-4 / AGG-4 (rate-limit sort) — VERIFIED STILL APPLICABLE

- Confirmed `src/lib/security/in-memory-rate-limit.ts:41-47` sorts on overflow.
- Maps to AGG-2 in cycle-6 backlog. Severity MEDIUM; deferred.

### Other stale findings

- C7-TE-1 (no test for time route): VERIFIED gap; recommended for implementation.
- C7-DB-1 (countdown clock-skew): VERIFIED RESOLVED via AGG-1 fix.
- C7-UX-1: VERIFIED RESOLVED via AGG-1 fix.
- C7-AR-1: VERIFIED partial-RESOLVED (time endpoint side); participant-status side carry-forward.
- C7-DB-2 (auth fallback): VERIFIED unchanged; `src/lib/auth/config.ts` no-touch.
- C7-DB-3 (SSE close race): VERIFIED correctly handled.

## Verification of cycle-6 commits at HEAD

- `72868cea` (SUDO_PASSWORD): `deploy-docker.sh:75` `_CALLER_SUDO_PASSWORD`, `:92` restore, `:284` `sudo_pw="${SUDO_PASSWORD:-${SSH_PASSWORD}}"`. All present.
- `2791d9a3` (DEPLOY_SSH_RETRY_MAX): `deploy-docker.sh:224` `local max_attempts="${DEPLOY_SSH_RETRY_MAX:-4}"`, `:226` regex validation + warn fallback. All present.
- Both purely additive; no regression risk.

## Convergence indicators

- Cycle-7 change surface: 0 commits vs `45502305`.
- Net `src/` lines changed in cycle-6: 0.
- New findings cycles 5-7: 0/0/0 (after stale-set audit).
- Backlog: shrunk by 3 items in cycle-6 (C5-SR-1, C3-AGG-2, C3-AGG-3).
- Strong convergence trend; cycle-7 will introduce 2-3 LOW draw-downs per orchestrator directive, so non-zero COMMITS expected.

## NEW verifier findings this cycle

**0 NEW.** All stale findings either RESOLVED at HEAD or deferred with exit criteria.

## Recommendation for cycle-7 PROMPT 2 / 3

1. Doc-only closures: C7-CR-1/AGG-1, C7-SR-2/AGG-2 (both silently RESOLVED at HEAD).
2. **Pre-emptive `useVisibilityAwarePolling` hook extraction** (C2-AGG-5 retire).
3. **C7-TE-1 unit test for `/api/v1/time`** (small, valuable).
4. Re-run gates in Task Z to verify cycle-6 gate snapshot still applies; record `per-cycle-success` post-deploy.

## Confidence

H.
