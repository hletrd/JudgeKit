# RPF Cycle 3 — Aggregate Review (2026-05-01)

**Date:** 2026-05-01
**HEAD reviewed:** `894320ff` (main, cycle-11 plan done)
**Reviewers:** code-reviewer, security-reviewer, perf-reviewer, critic, verifier, test-engineer, tracer, architect, debugger, document-specialist, designer (11 lanes; per-agent files in `.context/reviews/<agent>-cycle3.md`).

**Prior-cycle aggregate snapshot:** Preserved at `_aggregate.md` (cycle 2, HEAD `70c02a02`). The live `_aggregate.md` is now overwritten with this cycle's findings.

---

## Total deduplicated NEW findings (still applicable at HEAD `894320ff`)

**0 HIGH, 2 MEDIUM, 7 LOW NEW.** Note: Several findings overlap across specialist angles; deduped below with all citing agents preserved.

---

## Resolved at current HEAD (verified by inspection)

Cycle-2 findings confirmed RESOLVED at HEAD `894320ff`:
- **C2-AGG-1 (encryption JSDoc mismatch)**: RESOLVED. Module-level JSDoc now correctly says "hex" (verified at line 5-6 of encryption.ts).
- **C2-AGG-2 (dead _context parameter)**: RESOLVED. `_context` parameter removed from `validateAndHashPassword`; `bulk/route.ts` call site updated.
- **C2-AGG-3 (isNaN type assertion)**: RESOLVED. Explicit null narrowing used in submissions.ts.
- **C2-AGG-4 (parallelization opportunity)**: RESOLVED. Overrides query now runs in parallel with `Promise.all`.
- **C2-AGG-5 (encryption format test)**: RESOLVED. Test added verifying encrypted value format.

---

## NEW findings this cycle

### C3-AGG-1: [MEDIUM] participant-status.ts:99 — null status incorrectly returns "submitted"

- **Source:** code-reviewer (C3-CR-1), debugger (C3-DBG-1), verifier (confirmed), document-specialist (C3-DS-3)
- **File:** `src/lib/assignments/participant-status.ts:99`
- **Description:** When `latestStatus === null` AND `attemptCount > 0`, the function returns `"submitted"`. This is a semantic error: null status means "status unknown" or "not yet judged", not "submitted". A worker crash mid-judge would leave `status = null` in the DB, and the participant table would incorrectly show "submitted" instead of a more accurate status like "pending" or "queued".
- **Confidence:** HIGH (4-lane cross-agreement)
- **Fix:** Handle the null case separately — return `"pending"` when `latestStatus === null` and `attemptCount > 0`. Add a comment explaining the intended semantics. Add a test case for this edge case.

### C3-AGG-2: [MEDIUM] scoring.ts:78-99 — SQL column-name injection risk in buildIoiLatePenaltyCaseExpr

- **Source:** code-reviewer (C3-CR-2), security-reviewer (C3-SEC-1), tracer (confirmed safe current callers), document-specialist (C3-DS-1)
- **File:** `src/lib/assignments/scoring.ts:78-99`
- **Description:** String-interpolated column names in raw SQL. Current callers pass safe string literals, but the function signature accepts arbitrary strings with no validation. This is a design-level SQL injection risk. Parameterized values (bound via Drizzle's `sql` template) are safe, but column names are not validated.
- **Confidence:** HIGH (4-lane cross-agreement)
- **Fix:** Add a regex validation `^[a-zA-Z_][a-zA-Z0-9_.]*$` on all column name parameters. Add a `@security` JSDoc annotation warning about string interpolation.

### C3-AGG-3: [LOW] in-memory-rate-limit.ts — BACKOFF_CAP inconsistency with DB-backed module

- **Source:** code-reviewer (C3-CR-3), critic (C3-CRT-1), architect (C3-ARCH-2), debugger (C3-DBG-2), document-specialist (C3-DS-2)
- **File:** `src/lib/security/in-memory-rate-limit.ts:129`
- **Description:** The DB-backed `rate-limit.ts` uses `BACKOFF_CAP = 5` to limit the exponent before `Math.pow(2, ...)`. The in-memory rate limiter has no `BACKOFF_CAP` and instead caps the result with `MAX_BLOCK`. Both produce the same behavior, but the divergent implementation patterns are a drift risk. Additional data point for C7-AGG-9.
- **Confidence:** HIGH (5-lane cross-agreement)
- **Fix:** Add a `BACKOFF_CAP` constant to the in-memory module matching the DB module's value of 5, and apply it in the `Math.pow(2, ...)` call. Update module header comment to note the alignment.

### C3-AGG-4: [LOW] in-memory-rate-limit.ts — no dedicated unit test

- **Source:** test-engineer (C3-TE-1), verifier (confirmed gap)
- **File:** `src/lib/security/in-memory-rate-limit.ts`
- **Description:** No dedicated test file exists for the in-memory rate limiter. The DB-backed module and sidecar client both have tests, but the in-memory module's unique behaviors (eviction, exponential backoff, consume API, reset) are untested in isolation.
- **Confidence:** HIGH (2-lane)
- **Fix:** Create `tests/unit/security/in-memory-rate-limit.test.ts` covering eviction, backoff, consume, and reset.

### C3-AGG-5: [LOW] submissions/visibility.ts:90-99 — N+1 DB query pattern

- **Source:** code-reviewer (C3-CR-5), perf-reviewer (C3-PERF-2), critic (C3-CRT-3)
- **File:** `src/lib/submissions/visibility.ts:90-99`
- **Description:** The `sanitizeSubmissionForViewer` function makes an individual DB query per submission when `assignmentVisibility` is not provided. The JSDoc documents this, but the function signature doesn't enforce it. In bulk contexts, this creates N+1 queries.
- **Confidence:** HIGH (3-lane)
- **Fix:** Add a performance warning log when `assignmentVisibility` is absent and `assignmentId` is present, or make the parameter required in bulk contexts.

### C3-AGG-6: [LOW] compiler/execute.ts:381 — unbounded task queue in pLimit

- **Source:** perf-reviewer (C3-PERF-3)
- **File:** `src/lib/compiler/execute.ts:381`
- **Description:** The `executionLimiter` uses `pLimit` which queues tasks without bound. Under sustained high load, queued closures hold request context (source code up to 64KB each), causing memory pressure.
- **Confidence:** MEDIUM (1-lane)
- **Fix:** Add a queue size limit. If the queue is full, return "runner at capacity" immediately.

### C3-AGG-7: [LOW] participant-status.ts — `now` parameter lacks type branding

- **Source:** critic (C3-CRT-5)
- **File:** `src/lib/assignments/participant-status.ts:29`
- **Description:** The `now` parameter is typed as `number` but should semantically be either DB time (server callers) or client time (browser callers). Adding a branded type would prevent accidental misuse.
- **Confidence:** MEDIUM (1-lane)
- **Fix:** Consider a branded type `DbTimeMs` / `ClientTimeMs` to distinguish the two time sources at the type level.

### C3-AGG-8: [LOW] scoring.ts — mixed abstraction levels

- **Source:** architect (C3-ARCH-1), critic (C3-CRT-2)
- **File:** `src/lib/assignments/scoring.ts`
- **Description:** The module mixes TypeScript scoring logic with raw SQL generation. These are fundamentally different abstraction levels that should be in separate modules.
- **Confidence:** MEDIUM (2-lane)
- **Fix:** Extract `buildIoiLatePenaltyCaseExpr` into a dedicated `scoring-sql.ts` module.

### C3-AGG-9: [LOW] compiler/execute.ts — module size approaching extraction threshold

- **Source:** architect (C3-ARCH-3)
- **File:** `src/lib/compiler/execute.ts` (852 lines)
- **Description:** This module contains Docker execution, orphan cleanup, Rust runner delegation, shell validation, and concurrency limiting. While not yet at the deploy-script threshold, it's approaching a size where splitting would improve maintainability.
- **Confidence:** MEDIUM (1-lane)
- **Fix:** Consider extracting into docker-executor.ts, orphan-cleanup.ts, rust-runner.ts, and shell-validation.ts.

---

## Path drift / count drift corrections this cycle

| Carry-forward ID | Prior count/path | Updated at HEAD `894320ff` |
|---|---|---|
| C1-AGG-3 | 27 client console.error sites | **27 unchanged** at HEAD |
| AGG-2 | `in-memory-rate-limit.ts` lines 31, 33, 65, 84, 109, 158 (Date.now) | **unchanged** at HEAD |

All other carry-forward line counts verified unchanged at HEAD.

---

## Carry-forward DEFERRED items (status verified at HEAD `894320ff`)

| ID | Severity | File+line | Status | Exit criterion |
| --- | --- | --- | --- | --- |
| C3-AGG-5 (prior C3-AGG-5) | LOW | `deploy-docker.sh` whole (~1098 lines) | DEFERRED | Modular extraction OR >1500 lines |
| C3-AGG-6 (prior C3-AGG-6) | LOW | `deploy-docker.sh:182-191` | DEFERRED | Multi-tenant deploy host |
| C2-AGG-5 (prior) | LOW | 5 polling components | DEFERRED | Telemetry signal OR 7th instance |
| C2-AGG-6 (prior) | LOW | `src/app/(public)/practice/page.tsx:417` | DEFERRED | p99 > 1.5s OR > 5k matching problems |
| C1-AGG-3 (prior) | LOW | client `console.error` sites (27 at HEAD) | DEFERRED | Telemetry/observability cycle |
| C5-SR-1 (prior) | LOW | `scripts/deploy-worker.sh:101-107` | DEFERRED | untrusted-source APP_URL |
| DEFER-ENV-GATES | LOW | Env-blocked tests | DEFERRED | Fully provisioned CI/host |
| D1 | MEDIUM | `src/lib/auth/...` JWT clock-skew | DEFERRED | Auth-perf cycle |
| D2 | MEDIUM | `src/lib/auth/...` JWT DB query per request | DEFERRED | Auth-perf cycle |
| AGG-2 (prior) | MEDIUM | `in-memory-rate-limit.ts` Date.now + overflow sort | DEFERRED | Rate-limit-time perf cycle |
| ARCH-CARRY-1 | MEDIUM | 20 raw of 104 API route handlers | DEFERRED | API-handler refactor cycle |
| ARCH-CARRY-2 | LOW | `realtime-coordination.ts` + SSE route | DEFERRED | SSE perf cycle OR > 500 concurrent |
| PERF-3 | MEDIUM | Anti-cheat heartbeat query | DEFERRED | Anti-cheat p99 > 800ms OR > 50 contests |
| C7-AGG-6 | LOW | `participant-status.ts` time-boundary tests | DEFERRED | Bug report on deadline boundary |
| C7-AGG-7 | LOW | `encryption.ts:79-81` decrypt plaintext fallback | DEFERRED-with-doc-mitigation | Production tampering incident OR audit cycle |
| C7-AGG-9 | LOW | Rate-limit 3-module duplication | DEFERRED-with-doc-mitigation | Rate-limit consolidation cycle |
| C1-AGG-4 (prior) | LOW | `compiler/execute.ts:660` chmod 0o770 | DEFERRED | Security audit OR operator reports |

No HIGH findings deferred. No security/correctness/data-loss findings deferred.

---

## Cross-agent agreement summary (cycle 3)

- **C3-AGG-1 (null status -> "submitted")**: 4-lane (code-reviewer + debugger + verifier + document-specialist)
- **C3-AGG-2 (SQL column injection)**: 4-lane (code-reviewer + security-reviewer + tracer + document-specialist)
- **C3-AGG-3 (BACKOFF_CAP inconsistency)**: 5-lane (code-reviewer + critic + architect + debugger + document-specialist)
- **C3-AGG-4 (in-memory rate limit test gap)**: 2-lane (test-engineer + verifier)
- **C3-AGG-5 (N+1 visibility query)**: 3-lane (code-reviewer + perf-reviewer + critic)
- **C3-AGG-8 (mixed abstraction scoring)**: 2-lane (architect + critic)
- **No new HIGH findings**: all 11 lanes agree
- **All carry-forward items accurate at HEAD**: all 11 lanes agree

## Agent failures

None. All 11 reviewer perspectives produced artifacts in `.context/reviews/<agent>-cycle3.md`.

---

## Implementation queue for PROMPT 3

1. **C3-AGG-1 (MEDIUM)** — Fix null status -> "submitted" in `participant-status.ts:99`. Add comment, fix logic, add test case.
2. **C3-AGG-2 (MEDIUM)** — Add column name validation to `buildIoiLatePenaltyCaseExpr`. Add `@security` JSDoc.
3. **C3-AGG-3 (LOW)** — Add `BACKOFF_CAP` to in-memory rate limiter. Update header comment.
4. **C3-AGG-4 (LOW)** — Create `tests/unit/security/in-memory-rate-limit.test.ts`.
5. **Gates** — Run all gates per orchestrator directive.
6. **Deploy** — Per-cycle if source code changes are committed.

Deferrable (recorded in plan with exit criteria):
- C3-AGG-5 (N+1 query) — LOW, add perf warning log
- C3-AGG-6 (unbounded queue) — LOW, add queue limit
- C3-AGG-7 (type branding) — LOW, design improvement
- C3-AGG-8 (mixed abstraction) — LOW, module extraction
- C3-AGG-9 (module size) — LOW, deferred extraction
- All carry-forwards in the table above
