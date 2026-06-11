# Test Engineer — Cycle 5

**Reviewer:** test-engineer
**Base commit:** 6bb2b2eb
**Date:** 2026-05-14

## Findings

### T5-1: No tests for `validateShellCommand` regex edge cases [LOW]

- **File:** `src/lib/compiler/execute.ts:170-175`
- **Confidence:** Medium
- **Description:** The shell command validator is critical for the compiler sandbox but has no unit tests for its regex behavior. Edge cases like `$1`, `$0`, `$#`, `$@`, `${var}`, `$(cmd)`, and legitimate commands with allowed characters are untested. The regex was recently tightened (cycles 3-4) but test coverage was not added.
- **Fix:** Add unit tests for `validateShellCommand` covering allowed patterns, blocked patterns, and boundary cases.

### T5-2: No tests for `isAllowedJudgeDockerImage` with trusted registries [LOW]

- **File:** `src/lib/judge/docker-image-validation.ts:32-51`
- **Confidence:** Medium
- **Description:** The Docker image validation logic has tests for local images but no tests for the trusted registry path (`hasRegistryPrefix = true`). The `isTrustedRegistryImage` boundary check (line 10: `nextChar === "/" || nextChar === ":" || nextChar === undefined`) is subtle and untested.
- **Fix:** Add unit tests for `isAllowedJudgeDockerImage` with various registry prefixes and spoofing attempts.

### T5-3: Deferred test gaps remain open from prior cycles [LOW]

- **Files:** Various
- **Confidence:** High
- **Description:** Prior deferred test items for contest export route, group assignment export route, and SSE event route remain unimplemented. These were deferred in cycles 1-4 with exit criteria "add dedicated API mock tests".
- **Fix:** Track in deferred list; implement when priorities allow.

## Summary

3 findings: 3 LOW. All prior test fixes verified as passing.
