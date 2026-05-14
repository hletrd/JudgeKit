# Cycle 5 RPF Review Remediation Plan

> Date: 2026-05-14
> Source: `.context/reviews/_aggregate-cycle-5.md`
> Status: In Progress

## Summary

Cycle 5 discovered 2 MEDIUM and 4 LOW findings. The most impactful is M1: heartbeat entries in the `rateLimits` table are never cleaned up, causing guaranteed production table bloat under user growth.

## Tasks

### M1: Add cleanup for `rateLimits` heartbeat entries

- **Severity:** MEDIUM
- **Files:** `src/lib/realtime/realtime-coordination.ts`
- **Description:** `shouldRecordSharedHeartbeat` inserts/updates `rateLimits` rows with key prefix `realtime:heartbeat:%` but never deletes expired ones.
- **Implementation:**
  1. In `shouldRecordSharedHeartbeat`, after updating/inserting the heartbeat record, also delete stale heartbeat entries for the same assignment (or all expired heartbeats).
  2. Alternatively, add a `deleteExpiredHeartbeats` helper function and call it from `shouldRecordSharedHeartbeat`.
  3. Threshold: delete entries where `blockedUntil < nowMs - minIntervalMs` or `lastAttempt < nowMs - minIntervalMs`.
- **Exit criterion:** Heartbeat entries older than 2x `minIntervalMs` are cleaned up on each heartbeat operation.

### M2: Fix `validateShellCommand` to block positional parameter expansion

- **Severity:** MEDIUM
- **File:** `src/lib/compiler/execute.ts:173`
- **Description:** Regex `$[A-Za-z_]` allows `$1`, `$0`, etc.
- **Implementation:**
  1. Change `$[A-Za-z_]` to `$[A-Za-z0-9_]`.
  2. Update the comment to document that positional parameters are also blocked.
  3. Add/update unit tests in `tests/unit/compiler/execute.test.ts` (or create if missing).
- **Exit criterion:** `validateShellCommand("echo $1")` returns `false`.

### L1: Unify source code size validation to use byte length

- **Severity:** LOW
- **Files:** `src/app/api/v1/compiler/run/route.ts`, `src/app/api/v1/playground/run/route.ts`, `src/lib/compiler/execute.ts`
- **Description:** Zod schema checks string length (UTF-16 code units), execution checks UTF-8 bytes.
- **Implementation:**
  1. Create a shared `MAX_SOURCE_CODE_BYTES = 64 * 1024` constant if not already shared.
  2. Update the Zod schema for `sourceCode` to use a custom refinement:
     ```ts
     sourceCode: z.string().min(1).refine(
       (v) => Buffer.byteLength(v, "utf8") <= MAX_SOURCE_CODE_BYTES,
       { message: "sourceCodeTooLarge" }
     )
     ```
  3. Remove the duplicate byte-length check in `executeCompilerRun` (or keep it as defense-in-depth).
- **Exit criterion:** A 40K-character Korean source code fails schema validation with a clear error message.

### L2: Add deterministic tie-breaker to platform mode SQL queries

- **Severity:** LOW
- **File:** `src/lib/platform-mode-context.ts`
- **Description:** Raw SQL queries lack `id ASC` tie-breaker in ORDER BY.
- **Implementation:**
  1. In `findRestrictedAssignmentIdForProblem`, change ORDER BY to `ORDER BY a.starts_at DESC NULLS LAST, a.created_at DESC, a.id ASC`.
  2. In `findActiveRestrictedAssignmentIdForUser`, make the same change.
- **Exit criterion:** Both queries include `a.id ASC` as final sort key.

### L3: Harden `submittedAt` schema against Infinity

- **Severity:** LOW
- **File:** `src/app/api/v1/judge/claim/route.ts:53-62`
- **Description:** `submittedAt` schema accepts `Infinity` and strings that parse to `Infinity`.
- **Implementation:**
  1. Change number refine from `!Number.isNaN(n)` to `Number.isFinite(n)`.
  2. Change string transform to check `Number.isFinite(n)` after parsing.
- **Exit criterion:** `submittedAt` schema rejects `Infinity`, `-Infinity`, and `"1e309"`.

## Deferred Items (Unchanged)

| ID | Severity | File | Description | Reason |
|----|----------|------|-------------|--------|
| SSE-M2 | LOW | `events/route.ts:224-232` | Unbounded `inArray` query | Complex refactor; requires careful testing under load |
| SSE-RACE | LOW | `events/route.ts:161-166` | `stopSharedPollTimer` race | Requires promise tracking infrastructure; low impact |
| COR-1 | LOW | Judge claim problem lookup | Outside transaction scope | Raw SQL single-statement atomicity is sufficient |
| ARCH-1 | LOW | `createApiHandler` | Generic 500 error | Breaking change to error contract; requires wide refactor |
| ARCH-2 | LOW | Judge worker dual token | Token redundancy | Maintains backward compatibility with older workers |
| DEFER-52 | LOW | `docker/client.ts` | String accumulation in parser | Low impact; head+tail buffer strategy is intentional |

## Test Coverage Gaps (Deferred)

| ID | Severity | File | Gap |
|----|----------|------|-----|
| T5-1 | LOW | `validateShellCommand` | No unit tests for regex edge cases |
| T5-2 | LOW | `isAllowedJudgeDockerImage` | No tests for trusted registry path |

## Quality Gates

- [ ] eslint passes
- [ ] tsc --noEmit passes
- [ ] next build passes
- [ ] vitest run passes
