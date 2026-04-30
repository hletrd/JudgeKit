# RPF Cycle 8 — Code Reviewer

**Date:** 2026-04-29
**HEAD reviewed:** `1c991812` (cycle-7 close-out)
**Cycle change surface vs cycle-7 close-out HEAD `1c991812`:** **0 commits, 0 files, 0 lines** (cycle 8 starts at HEAD = cycle-7 close-out).

## Scope

Review the cumulative cycle-7 diff (4 commits, single test file `tests/unit/api/time-route-db-time.test.ts` 65 lines + plan/review docs) plus broad sweep over `src/app/api/v1/time/route.ts`, the new test, related db-time machinery, and a sample of carry-forward sites.

## Findings

**0 NEW HIGH / 0 NEW MEDIUM / 0 NEW LOW.** Empty change surface. Re-validation of carry-forwards:

| Carry-forward ID | HEAD evidence | Status |
|---|---|---|
| AGG-2 (Date.now in rate-limit hot path) | `src/lib/security/in-memory-rate-limit.ts` lines 22, 24, 56, 75, 100, 149 (Date.now); 41-47 overflow sort | DEFERRED unchanged |
| ARCH-CARRY-1 (raw API handlers) | grep -L createApiHandler under src/app/api → **20 files** | DEFERRED unchanged |
| ARCH-CARRY-2 (SSE O(n) eviction) | both sites confirmed: `src/lib/realtime/realtime-coordination.ts` + `src/app/api/v1/submissions/[id]/events/route.ts:48-63` | DEFERRED unchanged |
| C1-AGG-3 (client console.error) | grep across `src/components/`+`src/app/` non-API → **24** at HEAD (was 25 in cycle-7 aggregate; -1 drift; severity unchanged; population variable) | DEFERRED with count-drift correction |
| C2-AGG-5 (visibility-aware polling) | 5 distinct files: `submission-list-auto-refresh.tsx`, `submissions/submission-detail-client.tsx`, `layout/active-timed-assignment-sidebar-panel.tsx`, `exam/anti-cheat-monitor.tsx`, `exam/countdown-timer.tsx` (5 sites; under 7-trigger) | DEFERRED unchanged |

## Cycle-7 commits — quality review

1. `33c294b5` (docs(reviews): RPF cycle 7 reviews + aggregate) — clean docs commit; no code; no concerns.
2. `abebb843` (docs(plans): cycle 7 plan + cycle 6 archive) — clean docs commit; archive move via `git mv` preserves history.
3. `9e928fd1` (test(api): source-level regression test for `/api/v1/time` DB-time usage) — only code commit. Reviewed in detail:
   - File `tests/unit/api/time-route-db-time.test.ts`, 65 lines.
   - Test approach: source-level `readFileSync` regex assertions, modeled on `tests/unit/api/judge-claim-db-time.test.ts`. Sidesteps DEFER-ENV-GATES (no Postgres harness needed).
   - Three assertions: (a) imports `getDbNowMs` from `@/lib/db-time`; (b) GET handler calls `getDbNowMs()` and not `Date.now()`; (c) `dynamic = "force-dynamic"` exported.
   - Regex `/export\s+async\s+function\s+GET\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/` greedy-lazy on `[\s\S]*?` followed by `\n\}` — matches first `\n}` after `GET(...) {`. For the current 1-line handler this is correct. Accepts brace style on its own line. **Minor observation (LOW):** if a future refactor wraps the GET body in a try/catch with multiple closing braces, the regex would capture only up to the first `\n}` — but that would still be the inner block and the test assertions would still pass on the inner content. **No defect.**
   - Test file does NOT call the route, doesn't import `next/server`, no side effects, runs deterministically in 2.82s alongside the existing source-level tests.
4. `1c991812` (docs(plans): mark cycle 7 Tasks Z + ZZ done) — close-out doc commit; no code; OK.

## Cross-cuts

- The new test follows established source-level pattern (`tests/unit/api/judge-claim-db-time.test.ts`). Convention preserved.
- No suppressions added; no `--no-verify`; no force-push; commits GPG-signed; conventional + gitmoji format observed.
- Korean text untouched; `src/lib/auth/config.ts` untouched.

## Recommendations for cycle 8 LOW backlog draw-down

This cycle should pick 2-3 LOW items per orchestrator directive. Code-reviewer pick recommendations (priority ordered):

1. **C7-DS-1 (carry)** — `README.md` missing `/api/v1/time` endpoint doc. **Lightweight (≤ 30 lines doc).** Closes a documentation gap on a route that the client now depends on for clock sync. Doc-only; zero code risk.
2. **C7-DB-2-upper-bound (carry)** — `deploy-docker.sh:224` `DEPLOY_SSH_RETRY_MAX` no upper bound. **Lightweight (≤ 10 lines bash).** Operator-footgun mitigation. Add a soft cap (e.g. 100) with a clear log warning when exceeded; preserves override.
3. **C7-AGG-9 (carry)** — `src/lib/security/{in-memory,api-,}rate-limit.ts` 3-module duplication. Heavy. **Skip this cycle.**
4. **DEFER-ENV-GATES** — heavyweight; skip.

**Final pick recommendation:** items 1 + 2 above. Both lightweight, both pure-additive (no behavior change in hot paths), both directly retire long-standing LOW deferred items.

## Confidence

H on closure verdict; H on test-quality assessment; M on backlog-pick recommendation (orchestrator may choose differently).
