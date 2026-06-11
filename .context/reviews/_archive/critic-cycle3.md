# Critic — Cycle 3 Deep Review (2026-05-01)

**HEAD reviewed:** `894320ff` (main)

## Multi-perspective critique

### Correctness concerns

1. **C3-CR-1 (confirmed):** `participant-status.ts:99` null status -> "submitted" is a semantic error. The intention seems to be "submitted but not yet judged", but the null case is indistinguishable from a data integrity issue.

2. **C3-CR-2 / C3-SEC-1 (confirmed):** `buildIoiLatePenaltyCaseExpr` SQL column interpolation. The design is intentionally flexible but lacks a safety net. Adding a regex guard would be cheap insurance.

### Maintainability concerns

3. **C3-CRT-1:** Rate-limiting across three files (`in-memory-rate-limit.ts`, `api-rate-limit.ts`, `rate-limit.ts`) with cross-references in comments but no shared types or constants. The `BACKOFF_CAP` inconsistency (present in DB module, absent in in-memory module) exemplifies the drift risk. This is tracked under C7-AGG-9 but the specific `BACKOFF_CAP` inconsistency is a new data point.

4. **C3-CRT-2:** The `scoring.ts` file has both TypeScript scoring logic and raw SQL generation in the same module. The SQL generation (`buildIoiLatePenaltyCaseExpr`) is a fundamentally different abstraction level than the JS scoring function (`mapSubmissionPercentageToAssignmentPoints`). Mixing these makes the module harder to test and reason about.

### Design concerns

5. **C3-CRT-3:** The `sanitizeSubmissionForViewer` function has an optional `assignmentVisibility` parameter with a hidden DB query fallback. The JSDoc documents it, but the type signature doesn't enforce it. This is a design smell: the function should either require the parameter or be split into two functions (one for single, one for bulk).

6. **C3-CRT-4:** The `compiler/execute.ts` module has grown to 852 lines with Docker execution, orphan cleanup, Rust runner delegation, shell validation, and concurrency limiting all in one file. This is a candidate for modular extraction, though it is not yet at the deploy-script threshold (C3-AGG-5).

### Cross-cutting observations

7. **C3-CRT-5:** The codebase consistently uses DB server time (`getDbNowMs`, `getDbNowUncached`) for temporal comparisons, which is excellent. However, the `participant-status.ts` module accepts a `now` parameter that could be either DB time or client `Date.now()` — the type signature is just `number`. Adding a branded type (e.g., `DbTimeMs` vs `ClientTimeMs`) would prevent accidental misuse.

## Findings summary

All confirmed findings from other agents are cross-validated. The critic adds the `BACKOFF_CAP` inconsistency as a new data point for C7-AGG-9 and identifies the `scoring.ts` mixed-abstraction concern and `now` parameter branding as quality improvements.
