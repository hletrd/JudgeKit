# Tracer — Cycle 5

**Reviewer:** tracer
**Base commit:** 6bb2b2eb
**Date:** 2026-05-14

## Causal Traces

### TRACE-1: `rateLimits` table bloat — root cause trace

**Hypothesis:** The `rateLimits` table accumulates stale entries because cleanup only targets SSE prefixes.

**Evidence:**
- `acquireSharedSseConnectionSlot` calls `tx.delete(rateLimits).where(... key LIKE ${getSsePrefixPattern()} ESCAPE '\\' ...)` — line 104.
- `getSsePrefixPattern()` returns `realtime:sse:user:%` — line 57.
- `shouldRecordSharedHeartbeat` inserts keys with prefix `realtime:heartbeat:` — line 64.
- No function in the codebase deletes `realtime:heartbeat:%` entries.
- Confirmed by grep: only insert/update for heartbeat prefix, no delete.

**Conclusion:** Confirmed. Heartbeat entries are write-only from the application's perspective.

### TRACE-2: Shell command validator gap — regex trace

**Hypothesis:** The regex `$[A-Za-z_]` intentionally allows `$1` because positional parameters in `sh -c` with no args are empty.

**Evidence:**
- Regex: `/`|\$\(|\$\{|\$[A-Za-z_]|[<>]\(|\|\||\||>|<|\n|\r|\beval\b|\bsource\b/` — line 173.
- `$[A-Za-z_]` matches `$a`, `$FOO` but not `$1`, `$0`.
- Commands are passed as `["sh", "-c", command]` with no additional positional args.

**Conclusion:** The gap exists but is low-risk because positional parameters receive no values. Defense-in-depth should still block them.

### TRACE-3: Source code size mismatch — user confusion trace

**Hypothesis:** A user with CJK source code passes schema validation but fails execution validation.

**Evidence:**
- Zod: `z.string().max(64 * 1024)` checks string.length (UTF-16 code units).
- Execution: `Buffer.byteLength(sourceCode, "utf8")` checks UTF-8 bytes.
- Korean characters are typically 3 bytes in UTF-8.
- 40K Korean chars = ~40K string length (passes) but ~120K bytes (fails).

**Conclusion:** Confirmed. The mismatch is guaranteed for any multi-byte UTF-8 input.

## Summary

3 traces: 2 confirmed MEDIUM/HIGH signal, 1 confirmed LOW signal.
