# Aggregate Review — Cycle 5

**Date:** 2026-05-14
**Reviewers:** code-reviewer, security-reviewer, perf-reviewer, test-engineer, architect, critic, debugger, tracer (single-pass comprehensive — no registered subagents available)
**Scope:** JudgeKit codebase — verification of cycle-4 fixes and fresh cycle-5 review
**Base commit:** 6bb2b2eb

---

## New Findings Summary (This Cycle)

| Severity | Count |
|----------|-------|
| MEDIUM   | 2     |
| LOW      | 4     |
| **Total**| **6** |

---

## MEDIUM

### M1: `rateLimits` table heartbeat entries never cleaned up — guaranteed production bloat

- **Files:** `src/lib/realtime/realtime-coordination.ts:104-109, 152-203`, `src/lib/security/api-rate-limit.ts`
- **Reviewers:** security-reviewer (primary), perf-reviewer, architect, critic, debugger, tracer
- **Confidence:** High
- **Description:** The `rateLimits` table stores API rate limits, SSE connection slots, and heartbeat deduplication records. `acquireSharedSseConnectionSlot` cleans up expired SSE entries (`realtime:sse:user:%`) but `shouldRecordSharedHeartbeat` inserts entries with prefix `realtime:heartbeat:%` that are never deleted. Over time, the table grows without bound, degrading query performance for all rate-limit and SSE operations.
- **Fix:** Add periodic cleanup for expired heartbeat entries (e.g., in `shouldRecordSharedHeartbeat` after update, or a background task). Alternatively, migrate heartbeats to a separate table.

### M2: `validateShellCommand` allows `$0-$9` positional parameter expansion

- **File:** `src/lib/compiler/execute.ts:173`
- **Reviewers:** code-reviewer (primary), security-reviewer, critic, debugger, tracer
- **Confidence:** Medium
- **Description:** The regex `$[A-Za-z_]` blocks `$a`, `$FOO` but allows `$1`, `$0`, etc. because digits are excluded. In `sh -c` context, positional parameters could expand unexpectedly if an admin-configured command contains them. This is a defense-in-depth gap.
- **Fix:** Change `$[A-Za-z_]` to `$[A-Za-z0-9_]` to also block positional parameter expansion.

---

## LOW

### L1: Source code size validation uses different units in schema vs execution

- **Files:** `src/app/api/v1/compiler/run/route.ts:18-23`, `src/app/api/v1/playground/run/route.ts:12-18`, `src/lib/compiler/execute.ts:659-670`
- **Reviewers:** code-reviewer (primary), architect, critic, debugger, tracer
- **Confidence:** High
- **Description:** The Zod schema validates `sourceCode` using string length (UTF-16 code units), but `executeCompilerRun` checks UTF-8 byte length. For CJK/Korean text (3 bytes per character), a source code of 40K characters passes the schema but fails at execution time. This creates confusing UX where valid schema input is rejected at runtime.
- **Fix:** Update the Zod schema to use a custom refinement that checks `Buffer.byteLength(value, "utf8")`.

### L2: `findRestrictedAssignmentIdForProblem` and `findActiveRestrictedAssignmentIdForUser` lack deterministic tie-breaker

- **File:** `src/lib/platform-mode-context.ts:92-93, 163-164`
- **Reviewers:** code-reviewer
- **Confidence:** Medium
- **Description:** Both raw SQL queries order by `starts_at DESC, created_at DESC` without an `id ASC` tie-breaker. If two assignments have identical timestamps, the `LIMIT 1` result is nondeterministic.
- **Fix:** Add `, a.id ASC` as a final tie-breaker to both ORDER BY clauses.

### L3: `judge/claim/route.ts` `submittedAt` schema accepts Infinity

- **File:** `src/app/api/v1/judge/claim/route.ts:53-62`
- **Reviewers:** code-reviewer
- **Confidence:** Low
- **Description:** The `submittedAt` Zod schema does not reject `Infinity` or strings that parse to `Infinity` (e.g., `"1e309"`). The SQL query returns finite values, so this is a defense-in-depth gap rather than an active bug.
- **Fix:** Add `Number.isFinite(n)` check to both the number refine and string transform paths.

### L4: `events/route.ts` deferred findings remain open

- **File:** `src/app/api/v1/submissions/[id]/events/route.ts`
- **Reviewers:** perf-reviewer, security-reviewer
- **Confidence:** High
- **Description:** Two deferred findings from prior cycles remain unaddressed: (1) SSE `sharedPollTick` unbounded `inArray` query, and (2) `stopSharedPollTimer` race with in-progress tick.
- **Fix:** See deferred items below.

---

## Cross-Agent Agreement

- **M1** flagged by security-reviewer, perf-reviewer, architect, critic, debugger, tracer (very high signal).
- **M2** flagged by code-reviewer, security-reviewer, critic, debugger, tracer (high signal).
- **L1** flagged by code-reviewer, architect, critic, debugger, tracer (high signal).

---

## Deferred Findings Summary (Stable from Prior Cycles)

| ID | Severity | File | Description | First Deferred |
|----|----------|------|-------------|----------------|
| SSE-M2 | LOW | `src/app/api/v1/submissions/[id]/events/route.ts:224-232` | `sharedPollTick` unbounded `inArray` query | Cycle 7 |
| SSE-RACE | LOW | `src/app/api/v1/submissions/[id]/events/route.ts:161-166` | `stopSharedPollTimer` race with in-progress tick | Cycle 7 |
| COR-1 | LOW | Judge claim problem lookup | Outside transaction scope | Cycle 1 |
| PERF-1 | LOW | Proxy auth cache eviction | No TTL on positive hits (NOTE: actually has TTL; stale deferred item) | Cycle 1 |
| PERF-2 | LOW | `getStaleImages` sequential batching | Could parallelize image fetches | Cycle 1 |
| ARCH-1 | LOW | `createApiHandler` generic 500 error | Does not distinguish error types | Cycle 1 |
| ARCH-2 | LOW | Judge worker dual token system | Worker ID + secret token redundancy | Cycle 1 |
| DEFER-52 | LOW | `src/lib/docker/client.ts` | String accumulation in Docker output parser | Cycle 43 |

---

## Recommended Priority for Fixes

1. **Immediate:** M1 (`rateLimits` heartbeat cleanup) — guaranteed production degradation under growth.
2. **Short-term:** M2 (shell command validator gap) — defense-in-depth.
3. **Short-term:** L1 (source code size validation) — UX improvement.
4. **Medium-term:** L2 (deterministic ordering) — correctness under edge cases.
5. **Trivial:** L3 (submittedAt Infinity) — defense-in-depth.

---

## Quality Gates

| Gate | Status |
|------|--------|
| eslint | PASS (prior cycle) |
| tsc --noEmit | PASS (prior cycle) |
| next build | PASS (prior cycle) |
| vitest run | PASS (prior cycle) |

*Gates to be re-run after implementation.*
