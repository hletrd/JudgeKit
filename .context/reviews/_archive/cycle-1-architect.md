# RPF Loop Cycle 1 — Architect Review (2026-05-03)

**HEAD reviewed:** `37a4a8c3` (main)
**Reviewer:** architect

## Summary
Architecture continues to consolidate well. The recent month has reduced surface area (in-memory rate limiter removed; consolidation around DB-backed limits) and improved layering (canonical `buildIoiLatePenaltyCaseExpr` for both leaderboard and stats). Remaining concerns are 2 LOW items.

## NEW findings

### ARCH-1: [LOW] `recruit/[token]/results/page.tsx` reaches into DB schema directly, bypassing the `submissions` lib

- **File:** `src/app/(auth)/recruit/[token]/results/page.tsx:148-166`
- **Description:** The page issues raw `db.select` against `submissions` to compute "best per problem". This logic is already centralized in `src/lib/assignments/submissions.ts` (`getAssignmentStatusRows`), and `mapSubmissionPercentageToAssignmentPoints` exists in `scoring.ts`. The recruit page reimplements a smaller variant. This is code-reviewer CR-1 root cause — bypassing the canonical helper meant the percentage-to-points conversion was forgotten.
- **Confidence:** HIGH
- **Fix:** Extract a shared `getCandidateBestPerProblem(assignmentId, userId)` helper in `src/lib/recruiting/results.ts` that returns rows already adjusted via the canonical scoring function. Have the recruit page consume it; this also makes the function unit-testable in isolation.

### ARCH-2: [LOW] `pre-restore-snapshot.ts` lives in `src/lib/db/` but writes to filesystem

- **File:** `src/lib/db/pre-restore-snapshot.ts`
- **Description:** The module is filesystem-heavy (mkdir / writeFile / readdir / unlink) more than DB-heavy. Conceptually it sits under "ops" or "backup" rather than "db". Not a blocker; affects discoverability.
- **Confidence:** LOW
- **Fix:** Consider moving to `src/lib/ops/pre-restore-snapshot.ts` in a future refactor cycle.

### ARCH-3: [LOW] `compiler/execute.ts` is now 851 lines — same finding as cycle 3 C3-AGG-9

- **File:** `src/lib/compiler/execute.ts`
- **Description:** Cycle 3 deferred the split. Still deferred at HEAD. No new perf or correctness issue introduced; tracking only.
- **Confidence:** LOW (informational)
- **Status:** Tracked under cycle 3 C3-AGG-9; defer decision unchanged.

## Final-sweep checklist

- [x] Confirmed canonical `buildIoiLatePenaltyCaseExpr` is reused at all 3 call sites: `submissions.ts:616`, `contest-scoring.ts`, `leaderboard.ts`.
- [x] Confirmed `consumeApiRateLimit` and `consumeUserApiRateLimit` share `atomicConsumeRateLimit` (no duplication).
- [x] No layering violations introduced by recent commits.
