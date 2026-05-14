# Cycle 5 RPF Review Remediation Plan

> Date: 2026-05-14
> Source: `.context/reviews/_aggregate-cycle-5.md`
> Status: Complete

## Summary

Cycle 5 discovered 2 MEDIUM and 4 LOW findings. All implementable findings have been fixed. The most impactful was M1: heartbeat entries in the `rateLimits` table are never cleaned up, causing guaranteed production table bloat under user growth.

## Tasks

### M1: Add cleanup for `rateLimits` heartbeat entries — DONE

- **Severity:** MEDIUM
- **Files:** `src/lib/realtime/realtime-coordination.ts`
- **Commit:** `f0190774`
- **Description:** Added `getHeartbeatPrefixPattern()` and a cleanup step inside `shouldRecordSharedHeartbeat` that deletes stale heartbeat entries (`blockedUntil < nowMs - minIntervalMs`) after each insert/update.

### M2: Fix `validateShellCommand` to block positional parameter expansion — DONE

- **Severity:** MEDIUM
- **File:** `src/lib/compiler/execute.ts:173`
- **Commit:** `235054bb`
- **Description:** Changed `$[A-Za-z_]` to `$[A-Za-z0-9_]` and updated the comment. Added unit tests for `$0` and `$1` rejection.

### L1: Unify source code size validation to use byte length — DONE

- **Severity:** LOW
- **Files:** `src/app/api/v1/compiler/run/route.ts`, `src/app/api/v1/playground/run/route.ts`
- **Commit:** `9bf64aa2`
- **Description:** Updated Zod schemas to use `Buffer.byteLength(value, "utf8")` refinement instead of `z.string().max()`. This aligns API validation with execution-layer enforcement.

### L2: Add deterministic tie-breaker to platform mode SQL queries — DONE

- **Severity:** LOW
- **File:** `src/lib/platform-mode-context.ts`
- **Commit:** `399fc7c9`
- **Description:** Added `, a.id ASC` as final ORDER BY clause in `findRestrictedAssignmentIdForProblem` and `findActiveRestrictedAssignmentIdForUser`.

### L3: Harden `submittedAt` schema against Infinity — DONE

- **Severity:** LOW
- **File:** `src/app/api/v1/judge/claim/route.ts:53-62`
- **Commit:** `3df64a58`
- **Description:** Added `Number.isFinite(n)` check to both the number refine and string transform paths in the `submittedAt` schema.

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
| T5-1 | LOW | `validateShellCommand` | Unit tests added for $0/$1 but edge cases like `$#`, `$@` still uncovered |
| T5-2 | LOW | `isAllowedJudgeDockerImage` | No tests for trusted registry path |

## Quality Gates

- [x] eslint passes
- [x] tsc --noEmit passes
- [x] next build passes
- [x] vitest run passes (317 files, 2409 tests)
