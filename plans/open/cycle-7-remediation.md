# Cycle 7 Review Remediation Plan

**Date:** 2026-05-09
**Review source:** `.context/reviews/_aggregate.md` (cycle 7/100)
**HEAD:** main / d7640767
**Goal:** Fix all findings from cycle 7 code review.

---

## Items to implement this cycle

### 1. C7-1 — Validate `data.pairs` is an array in `computeSimilarityRust` [HIGH]
- **File:** `src/lib/assignments/code-similarity-client.ts:56-58`
- **Task:** Add `Array.isArray(data?.pairs)` validation before returning from `computeSimilarityRust`. If the sidecar returns valid JSON without a `pairs` field (or with a non-array `pairs`), return `null` so the TS fallback is used.
- **Status:** DONE (commit 705a3c46)

### 2. C7-2 — Validate rate-limiter sidecar response shape before treating as success [MEDIUM]
- **File:** `src/lib/security/rate-limiter-client.ts:79`
- **Task:** In `callRateLimiter`, after JSON parse succeeds, validate that the response shape matches the expected `T` contract before returning it. For `checkRateLimit` calls, verify `typeof data.allowed === "boolean"` and `typeof data.remaining === "number"`. If validation fails, treat as a sidecar error: increment `consecutiveFailures`, update `circuitOpenUntil`, and return `null` (triggering DB fallback). This preserves the fail-open contract.
- **Status:** DONE (commit 4fa691b0)

---

## Deferred items

None — both findings are correctness/reliability issues that should not be deferred. C7-1 is a crash bug and C7-2 violates the documented fail-open contract.

---

## Implementation order

1. C7-1 (code-similarity-client validation) — simpler fix, high impact
2. C7-2 (rate-limiter-client validation) — slightly more involved, requires shape validation

---

## Gate Results (pre-fix)

- `npx eslint .`: PASS (no errors, no warnings)
- `npx tsc --noEmit`: PASS
- `npx next build`: PASS
- `npx vitest run`: PASS (2338 tests)
- `npx vitest run --config vitest.config.component.ts`: PASS (179 tests)

## Gate Results (post-fix)

- `npx eslint .`: PASS (no errors, no warnings)
- `npx tsc --noEmit`: PASS
- `npx next build`: PASS
- `npx vitest run`: PASS (2338 tests)
- `npx vitest run --config vitest.config.component.ts`: PASS (179 tests)

## Deploy Results

- TBD after push
