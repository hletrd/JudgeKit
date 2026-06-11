# Debugger — Cycle 5

**Reviewer:** debugger
**Base commit:** 6bb2b2eb
**Date:** 2026-05-14

## Findings

### DBG-1: `rateLimits` table bloat — guaranteed production degradation [MEDIUM]

- **File:** `src/lib/realtime/realtime-coordination.ts:104-109, 152-203`
- **Confidence:** High
- **Failure scenario:** A school deploys JudgeKit with 5,000 students. Each student participates in 2 assignments per week. The heartbeat deduplication in `shouldRecordSharedHeartbeat` inserts or updates a `rateLimits` row with key `realtime:heartbeat:<assignmentId>:<userId>` every minute while the assignment is active. After 6 months, the `rateLimits` table has millions of stale heartbeat rows that are never cleaned up. The `fetchRateLimitEntry` and `acquireSharedSseConnectionSlot` queries slow down because PostgreSQL must scan past all these stale rows even with an index. Eventually, the table becomes large enough that vacuum and autovacuum struggle, causing query latency spikes.
- **Fix:** Add cleanup for expired heartbeat entries or migrate to a separate table.

### DBG-2: `validateShellCommand` `$1` bypass — hypothetical command injection [LOW]

- **File:** `src/lib/compiler/execute.ts:173`
- **Confidence:** Low
- **Failure scenario:** An admin configures a compile command that legitimately uses `$1` (e.g., a script that takes a filename argument). The validator allows it. The command is passed to `sh -c "..."` with no additional arguments, so `$1` is empty in the child shell. Not a direct injection, but if the command were ever refactored to pass arguments via the Docker command array, `$1` could expand unexpectedly.
- **Fix:** Block `$[0-9]` to close the gap.

### DBG-3: Source code size mismatch — user confusion [LOW]

- **File:** `src/app/api/v1/compiler/run/route.ts:18-23`, `src/lib/compiler/execute.ts:659-670`
- **Confidence:** High
- **Failure scenario:** A student writes a solution in Korean with ~45K characters. The API accepts it (Zod: 45K < 64K). The compiler rejects it with "Source code exceeds maximum size limit (64KB)". The student tries to shorten their code but can't understand why it's rejected — the character count is well under 64K. They report a bug to the instructor.
- **Fix:** Use byte-length validation in the Zod schema.

## Summary

3 findings: 1 MEDIUM, 2 LOW.
