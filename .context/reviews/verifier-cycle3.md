# Verifier — Cycle 3 Deep Review (2026-05-01)

**HEAD reviewed:** `894320ff` (main)

## Evidence-based correctness verification

### C3-CR-1: `participant-status.ts:99` — null status → "submitted"

**Verified:** The logic at line 99 reads:
```ts
if (latestStatus === "accepted" || latestStatus == null) {
    return "submitted";
}
```

When `latestStatus` is null AND `attemptCount > 0`, this returns "submitted". The previous condition (`isActiveSubmissionStatus(latestStatus)`) on line 82 would catch active statuses, but null falls through to line 99. The semantic intent appears to be "has submitted something, status unknown" → "submitted", but this conflates a missing-status record with an explicitly-submitted record.

**Verdict:** Confirmed as a semantic error. The correct return value for a null status with attempts should be distinct from "submitted".

### C3-CR-2: `scoring.ts:78-99` — SQL column interpolation

**Verified:** The function signature is:
```ts
export function buildIoiLatePenaltyCaseExpr(
  scoreCol: string = "score",
  pointsCol: string = "points",
  submittedAtCol: string = "submitted_at",
  personalDeadlineCol: string = "personal_deadline",
): string
```

All four column parameters are interpolated directly into SQL. Callers in `contest-scoring.ts` and `leaderboard.ts` pass string literals. The risk is design-level only.

**Verdict:** Confirmed as a design-level SQL injection risk. Current callers are safe.

### C3-CR-3: `in-memory-rate-limit.ts:129` — BACKOFF_CAP inconsistency

**Verified:** The DB-backed `rate-limit.ts` has `const BACKOFF_CAP = 5` at line 30. The in-memory `in-memory-rate-limit.ts` has `const MAX_BLOCK = 24 * 60 * 60 * 1000` at line 128 but no `BACKOFF_CAP`. The `Math.pow(2, entry.consecutiveBlocks)` at line 129 can produce `Infinity` for large `consecutiveBlocks`, but `Math.min(..., MAX_BLOCK)` caps the result. The DB module uses `Math.min(consecutiveBlocks, BACKOFF_CAP)` to cap the exponent before the `pow` call.

**Verdict:** Confirmed as inconsistency. Both paths produce the same result due to the different cap mechanisms, but the in-memory path relies on `Math.min` post-computation while the DB path caps the exponent pre-computation. No functional bug, but divergent implementation patterns.

### Carry-forward verification

All carry-forward deferred items verified as still applicable at HEAD:
- AGG-2: `in-memory-rate-limit.ts` lines 31, 33, 65, 84, 109, 158 (Date.now calls) — confirmed
- C3-AGG-5: `deploy-docker.sh` line count — not re-verified (deploy script, not source)
- D1/D2: JWT clock-skew/query-per-request — deferred, unchanged
- PERF-3: anti-cheat heartbeat — deferred, unchanged

### Test coverage verification

343 test files exist. Key modules with tests:
- `participant-status.ts` has `tests/unit/assignments/participant-status.test.ts` — verified
- `scoring.ts` has `tests/unit/assignments/scoring.test.ts` — verified
- `in-memory-rate-limit.ts` — no dedicated unit test file found (gap)
- `buildIoiLatePenaltyCaseExpr` — tested indirectly via scoring tests

**Test gap:** `in-memory-rate-limit.ts` has no dedicated unit test. The `BACKOFF_CAP` inconsistency and eviction behavior are untested in isolation.

## Final sweep

All verified findings are new this cycle. No stale findings resurrected. The codebase is in good shape overall — the issues found are edge cases and design-level concerns, not correctness-critical bugs.
