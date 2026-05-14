# Cycle 4 RPF Review Remediation Plan

> Date: 2026-05-14
> Source: `.context/reviews/_aggregate-cycle-4.md`
> Status: Complete

## Summary

Cycle 4 performed a comprehensive multi-perspective review of the full codebase. No new CRITICAL, HIGH, or MEDIUM findings were discovered. All 13 prior cycle-4 inner loop findings were verified as correctly implemented. The codebase remains in a clean state.

## Verified Prior Fixes (Cycle 4 Inner Loop)

| ID | Severity | File | Finding | Fix Verified |
|----|----------|------|---------|--------------|
| F1 | MEDIUM | `src/lib/api/pagination.ts` | Bare `parseInt` instead of `parsePositiveInt` | Uses `parsePositiveInt` |
| F2 | MEDIUM | `src/app/api/v1/contests/[assignmentId]/export/route.ts` | Local `escapeCsvCell` (weaker CSV formula injection mitigation) | Imports shared `escapeCsvField` |
| F3 | LOW | `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts` | Local `escapeCsvField` duplicate | Imports shared `escapeCsvField` |
| F6 | HIGH | `src/app/api/v1/contests/[assignmentId]/export/route.ts` | No row limit on export (OOM) | `MAX_EXPORT_ENTRIES = 10_000` |
| F7 | MEDIUM | `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts` | No row limit on export | `MAX_EXPORT_ROWS = 10_000` |
| M1 | MEDIUM | `src/app/(public)/problems/create/create-problem-form.tsx` | `isDirty` missing test cases and float error fields | Includes `floatAbsoluteError`, `floatRelativeError`, `testCases` |
| L1 | LOW | `src/app/(auth)/forgot-password/forgot-password-form.tsx` | Loading state leak on success | `setLoading(false)` after success |
| L2 | LOW | `src/app/(auth)/reset-password/reset-password-form.tsx` | Loading state leak on success | `setLoading(false)` after success |
| L4 | LOW | `src/app/api/v1/auth/verify-email/route.ts` | Raw internal errors forwarded | Returns sanitized `verifyFailed` |
| F4 | LOW | `src/app/api/v1/tags/route.ts` | Manual auth pattern | Uses `createApiHandler` |
| F2 (sec) | MEDIUM | `scripts/deploy-worker.sh` | Overwrites remote `.env` | `ensure_env_var` preserves keys |
| F3 (arch) | LOW | `src/proxy.ts` | Dead `/workspace/:path*` matcher | Removed |
| F2 (perf) | MEDIUM | `src/app/api/v1/submissions/route.ts` | Dual queries for count + data | Uses `COUNT(*) OVER()` |

## Actions Taken This Cycle

1. **Archived stale plan**: `plans/open/2026-05-14-cycle-3-rpf-review-remediation.md` moved to `plans/done/`.
2. **Verified code state**: Manually inspected all files referenced in prior reviews.
3. **Ran quality gates**: All gates pass (eslint, tsc --noEmit, next build, vitest).

## No New Implementation Required

No code changes were needed this cycle. The repository is in a clean state with all prior findings remediated.

## Deferred Items (Unchanged)

The following items remain deferred from prior cycles:

| ID | Severity | File | Description | First Deferred |
|----|----------|------|-------------|----------------|
| SSE-M2 | LOW | `src/app/api/v1/submissions/[id]/events/route.ts:224-232` | `sharedPollTick` unbounded `inArray` query | Cycle 7 |
| SSE-RACE | LOW | `src/app/api/v1/submissions/[id]/events/route.ts:161-166` | `stopSharedPollTimer` race with in-progress tick | Cycle 7 |
| COR-1 | LOW | Judge claim problem lookup | Outside transaction scope | Cycle 1 |
| PERF-1 | LOW | Proxy auth cache eviction | No TTL on positive hits | Cycle 1 |
| PERF-2 | LOW | `getStaleImages` sequential batching | Could parallelize image fetches | Cycle 1 |
| ARCH-1 | LOW | `createApiHandler` generic 500 error | Does not distinguish error types | Cycle 1 |
| ARCH-2 | LOW | Judge worker dual token system | Worker ID + secret token redundancy | Cycle 1 |
| DEFER-52 | LOW | `src/lib/docker/client.ts` | String accumulation in Docker output parser | Cycle 43 |

## Test Coverage Gaps (Deferred)

| ID | Severity | File | Gap |
|----|----------|------|-----|
| F1 | LOW | Contest export route | No API mock tests for CSV/JSON export, anonymization, anti-cheat counts, or truncation |
| F2 | LOW | Group assignment export route | No API mock tests for CSV export or auth checks |
