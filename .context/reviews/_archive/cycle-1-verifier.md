# RPF Loop Cycle 1 — Verifier Review (2026-05-03)

**HEAD reviewed:** `37a4a8c3` (main)
**Reviewer:** verifier

## Summary
Evidence-based verification of claims made by recent commits.

## Gate evidence

| Gate | Command | Status | Evidence |
|------|---------|--------|----------|
| eslint | `npm run lint` | PASS | exit 0; 0 lint errors |
| bash lint | `npm run lint:bash` | PASS | exit 0 |
| typecheck | `npx tsc --noEmit` | PASS at SOURCE | exit 0; tests are NOT in the noEmit set per default tsconfig (verified by reading `tsconfig.json` "include") |
| typecheck (tests) | (vitest transformer) | FAIL | `tests/unit/users/core.test.ts:200,220 — TS2554` (2-arg form on 1-arg function) |
| vitest unit | `npm run test:unit` | FAIL | 22 of 305 test files failed; 28 of 2228 tests failed |
| vitest security | `npm run test:security` | NOT RUN this cycle | TBD in PROMPT 3 |
| next build | `npm run build` | NOT RUN this cycle | TBD in PROMPT 3 (NB: build does not run vitest, so it should pass even with test failures) |
| playwright e2e | `npm run test:e2e` | NOT RUN this cycle | requires browser + dev server |

## NEW findings

### VER-1: [HIGH] Cycle-3 finding C3-AGG-1 (null status → submitted) is RESOLVED at HEAD

- **File:** `src/lib/assignments/participant-status.ts:99-105`
- **Evidence:** Source now has explicit `if (latestStatus === null) return "pending"` branch with a 3-line comment explaining the semantics. Test at `tests/unit/assignments/participant-status.test.ts` (a NEW file added at HEAD) covers the case.
- **Confidence:** HIGH
- **Status:** RESOLVED.

### VER-2: [HIGH] Cycle-3 finding C3-AGG-2 (SQL column-name injection in scoring) is RESOLVED at HEAD

- **File:** `src/lib/assignments/scoring.ts:60-81`
- **Evidence:** Source now validates each SQL column-name parameter via `validateSqlColumnName()` against `SQL_COLUMN_NAME_RE` and a `SQL_COLUMN_DANGEROUS_RE` blacklist. JSDoc carries `@security` annotations.
- **Confidence:** HIGH
- **Status:** RESOLVED.

### VER-3: [HIGH] Cycle-3 findings C3-AGG-3 and C3-AGG-4 (in-memory rate limiter BACKOFF_CAP and missing test) are RESOLVED — module deleted

- **File:** `src/lib/security/in-memory-rate-limit.ts` (DELETED)
- **Evidence:** Commit `a197bde8 fix(security): remove dead in-memory rate limiter`. Module file no longer exists. The DB-backed `rate-limit.ts` still has `BACKOFF_CAP = 5`. No regression.
- **Confidence:** HIGH
- **Status:** RESOLVED via removal — both findings closed.

### VER-4: [MEDIUM] Cycle-3 finding C3-AGG-5 (visibility N+1) is UNRESOLVED at HEAD

- **File:** `src/lib/submissions/visibility.ts:90-99`
- **Evidence:** Source still has the per-submission DB query path when `assignmentVisibility` is not provided. Recommendation in cycle 3 was to add a perf warning log; this hasn't landed.
- **Confidence:** HIGH
- **Status:** STILL OPEN; carry forward.

### VER-5: [MEDIUM] Cycle-3 finding C3-AGG-6 (pLimit unbounded queue in compiler/execute) is UNRESOLVED, deferred

- **File:** `src/lib/compiler/execute.ts:381`
- **Status:** STILL OPEN; deferred per cycle-3 plan, ok for this cycle.

### VER-6: [MEDIUM] Anti-cheat heartbeat fresh-window claim verifies

- **File:** `src/lib/assignments/submissions.ts:53-54, 298-317`
- **Description:** Commit `7eb128fc feat(security): require anti-cheat heartbeat freshness on exam submissions` claimed a 90 s freshness window with explicit 30 s buffer over the 60 s server throttle.
- **Evidence:** `ANTI_CHEAT_HEARTBEAT_FRESHNESS_MS = 90_000` confirmed at line 54. Used at line 313: `now - latestEventAt <= ANTI_CHEAT_HEARTBEAT_FRESHNESS_MS`. Behaviour matches the commit message.
- **Confidence:** HIGH
- **Status:** RESOLVED / verified.

## Final-sweep checklist

- [x] Re-ran `npm run lint`, `npm run lint:bash`, `npx tsc --noEmit`, `npm run test:unit` — fresh evidence at HEAD `37a4a8c3`.
- [x] Cross-checked each cycle-3 aggregate finding against current source.
- [x] No claims of completion made without fresh evidence.
