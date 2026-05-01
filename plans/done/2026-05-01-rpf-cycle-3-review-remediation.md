# Cycle 3 Review Remediation Plan (2026-05-01 RPF loop)

**Date:** 2026-05-01
**Source:** `.context/reviews/_aggregate.md` (cycle 3) + cycle-3 lane reviews + carry-forward from cycle 2 plan
**HEAD entering this cycle:** `894320ff` (docs(plans): mark cycle 11 RPF plan done; archive to plans/done/)
**Status:** COMPLETED

---

## Cycle entry-state summary

- Cycle 2 resolved 5 findings: C2-AGG-1 (encryption JSDoc), C2-AGG-2 (dead _context), C2-AGG-3 (isNaN type assertion), C2-AGG-4 (query parallelization), C2-AGG-5 (encryption format test). Cycle 2 plan archived to `plans/done/2026-05-01-rpf-cycle-2-review-remediation.md`.
- Cycle 3 review surface: deep multi-agent review of entire codebase, 11 specialist lanes. 2 MEDIUM + 7 LOW new findings.
- This cycle's deploy must NOT preemptively set `DRIZZLE_PUSH_FORCE=1`.

---

## Tasks

### Task A: [MEDIUM — DOING THIS CYCLE] Fix null status -> "submitted" in participant-status.ts (C3-AGG-1)

- **Source:** C3-AGG-1 (4-lane: code-reviewer, debugger, verifier, document-specialist)
- **Files:**
  - `src/lib/assignments/participant-status.ts:99`
- **Fix:**
  1. Change line 99 from `if (latestStatus === "accepted" || latestStatus == null)` to only match `"accepted"`, and handle the null case by returning `"pending"` when `latestStatus === null` and `attemptCount > 0`.
  2. Add a comment explaining the intended semantics of the null case.
  3. Add a test case for null status + positive attempts scenario in `tests/unit/assignments/participant-status.test.ts`.
- **Exit criteria:** `latestStatus === null` with `attemptCount > 0` returns `"pending"`, not `"submitted"`. Test case passes.
- [x] Done — commit `e9cfb762`. Null status with attempts now returns "pending". 3 new test cases pass.

### Task B: [MEDIUM — DOING THIS CYCLE] Add column name validation to buildIoiLatePenaltyCaseExpr (C3-AGG-2)

- **Source:** C3-AGG-2 (4-lane: code-reviewer, security-reviewer, tracer, document-specialist)
- **Files:**
  - `src/lib/assignments/scoring.ts:78-99`
- **Fix:**
  1. Add a validation function `validateSqlColumnName(name: string): string` that checks `^[a-zA-Z_][a-zA-Z0-9_.]*$` and throws on invalid input.
  2. Apply validation to all four column name parameters (`scoreCol`, `pointsCol`, `submittedAtCol`, `personalDeadlineCol`) at the top of `buildIoiLatePenaltyCaseExpr`.
  3. Add a `@security` JSDoc annotation warning about string interpolation and requiring trusted column names only.
- **Exit criteria:** `buildIoiLatePenaltyCaseExpr` validates column names before interpolation. Invalid names throw. `@security` JSDoc present.
- [x] Done — commit `3e075be8`. SQL column name validation with dual-regex approach (safe pattern + dangerous pattern blocklist). @security JSDoc added. All 18 scoring tests pass.

### Task C: [LOW — DOING THIS CYCLE] Add BACKOFF_CAP to in-memory rate limiter (C3-AGG-3)

- **Source:** C3-AGG-3 (5-lane: code-reviewer, critic, architect, debugger, document-specialist)
- **Files:**
  - `src/lib/security/in-memory-rate-limit.ts:129`
- **Fix:**
  1. Add `const BACKOFF_CAP = 5;` constant (matching `rate-limit.ts`).
  2. Change `Math.pow(2, entry.consecutiveBlocks)` to `Math.pow(2, Math.min(entry.consecutiveBlocks, BACKOFF_CAP))`.
  3. Update module header comment to note alignment with DB-backed module's BACKOFF_CAP.
- **Exit criteria:** In-memory rate limiter uses `BACKOFF_CAP = 5` consistent with DB-backed module. Header comment updated.
- [x] Done — commit `ab336b0a`. BACKOFF_CAP = 5 constant added, used in Math.min for exponent capping. Header comment updated.

### Task D: [LOW — DOING THIS CYCLE] Create unit tests for in-memory rate limiter (C3-AGG-4)

- **Source:** C3-AGG-4 (2-lane: test-engineer, verifier)
- **Files:**
  - New file: `tests/unit/security/in-memory-rate-limit.test.ts`
- **Fix:**
  1. Create test file covering:
     - `isRateLimitedInMemory` (within window, over limit, window expired)
     - `recordFailureInMemory` (exponential backoff with BACKOFF_CAP, MAX_BLOCK cap)
     - `recordAttemptInMemory` (basic recording)
     - `consumeInMemoryRateLimit` (request-based API, retryAfter)
     - `resetInMemory` (clears entry)
     - Eviction logic (time-based, FIFO overflow at MAX_ENTRIES)
- **Exit criteria:** All in-memory rate limiter functions have dedicated unit tests. Tests pass.
- [x] Done — commit `f276dd64`. 15 unit tests covering all 5 exported functions. Tests pass.

### Task Z: Run all gates (lint, build, test, bash -n)

- Run `eslint`, `next build`, `vitest run`, `bash -n deploy*.sh`
- Fix any errors found
- [x] Done — eslint clean, next build exit 0, vitest 24/24 pass, bash -n deploy*.sh clean.

### Task ZZ: Archive this plan if all tasks complete

- Move this plan to `plans/done/` after all tasks are marked done
- [x] Done — plan moved to plans/done/.

---

## Deferred Items

The following findings from the cycle 3 review are deferred this cycle with reasons:

| C3-AGG ID | Description | Severity | Reason for deferral | Exit criterion |
|-----------|-------------|----------|---------------------|----------------|
| C3-AGG-5 | N+1 DB query in sanitizeSubmissionForViewer | LOW | JSDoc already documents the pattern; no production perf report | Bulk sanitization refactor cycle OR N+1 observed in p99 metrics |
| C3-AGG-6 | Unbounded pLimit queue in compiler/execute.ts | LOW | No production memory-pressure report; concurrency already capped | Sustained high-load memory report OR compiler module refactor cycle |
| C3-AGG-7 | `now` parameter lacks type branding in participant-status.ts | LOW | Design improvement; no runtime bug | TypeScript strict-branded-types cycle OR participant-status refactor |
| C3-AGG-8 | Mixed abstraction levels in scoring.ts | LOW | Module extraction; no correctness impact | Scoring refactor cycle OR next scoring feature addition |
| C3-AGG-9 | compiler/execute.ts module size | LOW | Not at extraction threshold yet | Module >1200 lines OR compiler module refactor cycle |
| C3-AGG-2 (prior) | SSH/sudo credential rotation in deploy | LOW | Trigger not met | SSH/sudo credential rotation divergence on any target |
| C3-AGG-3 (prior) | SSH ControlSocket timeout in deploy | LOW | Trigger not met | Long-host wait OR ControlSocket connection refused |
| C3-AGG-5 (prior) | Deploy script modular extraction | LOW | Trigger not met | `deploy-docker.sh` >1500 lines OR 3 indep SSH-helpers edits |
| C3-AGG-6 (prior) | Peer-user awareness in deploy | LOW | Trigger not met | Multi-tenant deploy host added |
| C2-AGG-5 (prior) | Polling components | LOW | Trigger not met | Telemetry signal or 7th instance |
| C2-AGG-6 (prior) | Practice page search perf | LOW | Trigger not met | p99 > 1.5s OR > 5k matching problems |
| C1-AGG-3 (prior) | Client console.error sites (27) | LOW | Trigger not met | Telemetry/observability cycle opens |
| C1-AGG-4 (prior) | compiler/execute.ts chmod 0o770 | LOW | Trigger not met | Security audit OR operator reports |
| C5-SR-1 (prior) | deploy-worker.sh sed delimiter | LOW | Trigger not met | untrusted-source APP_URL |
| DEFER-ENV-GATES | Env-blocked tests | LOW | No CI host provisioned | Fully provisioned CI/host |
| D1 | JWT clock-skew | MEDIUM | Requires dedicated auth-perf cycle | Auth-perf cycle |
| D2 | JWT DB query per request | MEDIUM | Requires dedicated auth-perf cycle | Auth-perf cycle |
| AGG-2 (prior) | Date.now() in rate-limit | MEDIUM | Requires dedicated rate-limit-time cycle | Rate-limit-time perf cycle |
| ARCH-CARRY-1 | Raw API route handlers | MEDIUM | Requires dedicated API-handler refactor cycle | API-handler refactor cycle |
| ARCH-CARRY-2 | SSE eviction | LOW | Requires SSE perf cycle | SSE perf cycle |
| PERF-3 | Anti-cheat heartbeat query | MEDIUM | Requires anti-cheat perf cycle | Anti-cheat p99 > 800ms OR > 50 contests |
| C7-AGG-6 | participant-status time-boundary tests | LOW | Trigger not met | Bug report on deadline boundary |
| C7-AGG-7 | Encryption plaintext fallback | LOW | Deferred with doc mitigation | Production tampering incident OR audit cycle |
| C7-AGG-9 | Rate-limit 3-module duplication | LOW | Deferred with doc mitigation | Rate-limit consolidation cycle |

No security/correctness/data-loss findings deferred.

---

## Repo-policy compliance for cycle-3 implementation

- GPG-signed commits with conventional commit + gitmoji.
- Fine-grained commits (one per finding).
- `git pull --rebase` before `git push`. No force-push to main.
- No Korean text touched. `src/lib/auth/config.ts` not touched.
- Deploy: per-cycle (`SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false ./deploy-docker.sh`).
- DRIZZLE_PUSH_FORCE=1 NOT preemptively set.
