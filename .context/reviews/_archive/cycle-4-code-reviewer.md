# Cycle 4 — Code Reviewer Findings

> Generated: 2026-05-14
> Reviewer: single-pass comprehensive review (no registered subagents available)
> Scope: Full repository (599 source files, 436 test files, 3 Rust crates)
> Base commit: bc7e5998

---

## Summary

No new CRITICAL, HIGH, or MEDIUM findings. All prior cycle-4 (inner loop) findings that were scheduled for remediation have been verified as fixed. The codebase remains in a clean state.

## Verified Fixes (from prior cycle-4 inner loop)

| ID | Severity | File | Finding | Status |
|----|----------|------|---------|--------|
| F1 | MEDIUM | `src/lib/api/pagination.ts` | Bare `parseInt` instead of `parsePositiveInt` | FIXED — now uses `parsePositiveInt` |
| F2 | MEDIUM | `src/app/api/v1/contests/[assignmentId]/export/route.ts` | Local `escapeCsvCell` with weaker formula-injection mitigation | FIXED — now imports `escapeCsvField` from `@/lib/csv/escape-field` |
| F3 | LOW | `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts` | Local `escapeCsvField` duplicate | FIXED — now imports shared `escapeCsvField` |
| F6 | HIGH | `src/app/api/v1/contests/[assignmentId]/export/route.ts` | No row limit on export (OOM risk) | FIXED — `MAX_EXPORT_ENTRIES = 10_000` added |
| F7 | MEDIUM | `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts` | No row limit on export | FIXED — `MAX_EXPORT_ROWS = 10_000` added |
| M1 | MEDIUM | `src/app/(public)/problems/create/create-problem-form.tsx` | `isDirty` missing test cases and float error fields | FIXED — now includes `floatAbsoluteError`, `floatRelativeError`, `testCaseOverrideEnabled`, and `testCases` |
| L1 | LOW | `src/app/(auth)/forgot-password/forgot-password-form.tsx` | Loading state leak on success | FIXED — `setLoading(false)` after `setSuccess(true)` |
| L2 | LOW | `src/app/(auth)/reset-password/reset-password-form.tsx` | Loading state leak on success | FIXED — `setLoading(false)` after `setSuccess(true)` |
| L4 | LOW | `src/app/api/v1/auth/verify-email/route.ts` | Raw internal errors returned | FIXED — returns sanitized `verifyFailed` |
| F4 | LOW | `src/app/api/v1/tags/route.ts` | Manual auth pattern | FIXED — now uses `createApiHandler` |
| F2 (sec) | MEDIUM | `scripts/deploy-worker.sh` | Overwrites remote `.env` | FIXED — `ensure_env_var` preserves remote-only keys |
| F3 (arch) | LOW | `src/proxy.ts` | Dead `/workspace/:path*` matcher | FIXED — removed from matcher |
| F2 (perf) | MEDIUM | `src/app/api/v1/submissions/route.ts` | Dual queries for count + data | FIXED — offset path uses `COUNT(*) OVER()` single query |

## Minor Observations (No Action Required)

1. **LOW** `sharedPollTick` unbounded `inArray` query remains a known deferred issue (cycle 7 M2).
2. **LOW** `stopSharedPollTimer` race with in-progress `sharedPollTick` remains deferred.

## Conclusion

All actionable findings from the prior cycle-4 inner loop have been implemented correctly. No new code-quality issues discovered.
