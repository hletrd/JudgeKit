# Code Reviewer — Cycle 5

**Reviewer:** code-reviewer
**Base commit:** 6bb2b2eb
**Date:** 2026-05-14

## Findings

### C5-1: `validateShellCommand` allows `$0-$9` positional parameter expansion [MEDIUM]

- **File:** `src/lib/compiler/execute.ts:173`
- **Confidence:** Medium
- **Description:** The regex `$[A-Za-z_]` blocks `$a`, `$FOO`, etc. but allows `$1`, `$0`, `$9` because digits are excluded from the character class. In a `sh -c` context, positional parameters could expand unexpectedly if an admin-configured compile/run command contains them. This is a defense-in-depth gap that diverges from the stated intent of blocking variable substitution.
- **Fix:** Change `$[A-Za-z_]` to `$[A-Za-z0-9_]` to also block positional parameter expansion.

### C5-2: Source code size validation uses different units in schema vs execution [LOW]

- **File:** `src/app/api/v1/compiler/run/route.ts:18-23`, `src/app/api/v1/playground/run/route.ts:12-18`, `src/lib/compiler/execute.ts:659-670`
- **Confidence:** High
- **Description:** The Zod schema validates `sourceCode` using `z.string().max(64 * 1024)` which counts UTF-16 code units (JavaScript string length). But `executeCompilerRun` validates using `Buffer.byteLength(options.sourceCode, "utf8")` which counts UTF-8 bytes. For CJK/Korean text (3 bytes per character in UTF-8), a source code of 40K characters passes the schema but fails at execution time with "Source code exceeds maximum size limit". This creates inconsistent UX where valid schema input is rejected at runtime.
- **Fix:** Align both checks to use byte length. Update the Zod schema with a custom refinement that checks `Buffer.byteLength(value, "utf8")`.

### C5-3: `findRestrictedAssignmentIdForProblem` and `findActiveRestrictedAssignmentIdForUser` lack deterministic tie-breaker [LOW]

- **File:** `src/lib/platform-mode-context.ts:92-93, 163-164`
- **Confidence:** Medium
- **Description:** Both raw SQL queries order by `a.starts_at DESC NULLS LAST, a.created_at DESC` without an `a.id ASC` tie-breaker. If two assignments have identical `starts_at` and `created_at`, the `LIMIT 1` result is nondeterministic and may vary between executions, causing inconsistent platform mode enforcement.
- **Fix:** Add `, a.id ASC` as a final tie-breaker to both ORDER BY clauses.

### C5-4: `judge/claim/route.ts` `submittedAt` schema accepts Infinity [LOW]

- **File:** `src/app/api/v1/judge/claim/route.ts:53-62`
- **Confidence:** Low
- **Description:** The `submittedAt` Zod schema uses `z.number().refine((n) => !Number.isNaN(n))` which accepts `Infinity` and `-Infinity`. The string transform path also accepts `"1e309"` which parses to `Infinity`. While the SQL query returns finite `bigint` values, the schema is weaker than it should be as a defense-in-depth validator.
- **Fix:** Add `Number.isFinite(n)` check to both the number refine and string transform paths.

## Summary

4 findings: 1 MEDIUM, 3 LOW. No regressions from prior cycles.
