# Aggregate Review — Cycle 1 (RPF Loop)

**Date:** 2026-05-10
**Reviewers:** code-reviewer, perf-reviewer, security-reviewer, test-engineer, architect
**Scope:** New findings from this cycle's deep code review

---

## New Findings Summary (This Cycle)

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 0 |
| MEDIUM | 16 |
| LOW | 13 |
| **Total** | **30** |

---

## CRITICAL

### C1: SSE Parse Failure Does Not Trigger Fetch Fallback
- **File:** `src/hooks/use-submission-polling.ts:143-149`
- **Reviewer:** code-reviewer
- **Description:** When JSON.parse fails on an SSE message, the polling stops entirely without falling back to fetch polling. Users must manually refresh.
- **Fix:** Call `startFetchPolling()` in the parse-failure catch block.

---

## MEDIUM (16)

1. **Zod Validation Returns Only First Error** (`src/lib/api/handler.ts:163-166`) - code-reviewer
2. **File Extension Extraction Fails on Dotfiles** (`src/app/api/v1/files/[id]/route.ts:108`) - code-reviewer
3. **Judge Claim Raw SQL Parse Can Throw Unhandled** (`src/app/api/v1/judge/claim/route.ts:261-263`) - code-reviewer
4. **CSRF Validation Rejects Empty Origin Without sec-fetch-site** (`src/lib/security/csrf.ts:56-58`) - code-reviewer
5. **Offset Pagination Without Index Optimization** (`src/app/api/v1/submissions/route.ts:114-133`) - perf-reviewer
6. **truncateObject Has O(n^2) JSON Serialization** (`src/lib/audit/events.ts:55-91`) - perf-reviewer
7. **Infinite Polling Retry Without Error Classification** (`src/hooks/use-submission-polling.ts:267`) - perf-reviewer
8. **N+1 Query in Cursor Pagination** (`src/app/api/v1/submissions/route.ts:61-68`) - perf-reviewer
9. **Double Query for includeSummary** (`src/app/api/v1/submissions/route.ts:139-148`) - perf-reviewer
10. **Backup Stream Abort Handling Gap** (`src/app/api/v1/admin/backup/route.ts:90-106`) - security-reviewer
11. **File Download Content-Type Not Validated Against Magic Bytes** (`src/app/api/v1/files/[id]/route.ts:113-125`) - security-reviewer
12. **Submissions API compileOutput Filter Inconsistency** (`src/app/api/v1/submissions/route.ts:373-375`) - security-reviewer
13. **No Unit Tests for Scoring Logic** (`src/lib/judge/verdict.ts`) - test-engineer (HIGH impact)
14. **No Unit Tests for useSourceDraft Hook** (`src/hooks/use-source-draft.ts`) - test-engineer
15. **No Tests for Audit Event Buffer Flush** (`src/lib/audit/events.ts`) - test-engineer
16. **Monolithic Handler Factory Without Middleware Composition** (`src/lib/api/handler.ts`) - architect

---

## LOW (13)

1. **ICPC Cell Newline Formatting Relies on CSS Class** (`src/components/contest/leaderboard-table.tsx:69-81`) - code-reviewer
2. **Duplicate API Key Auth Attempt** (`src/lib/api/auth.ts:66-83`) - code-reviewer
3. **Rate Limit Eviction Timer Never Stops in Tests** (`src/lib/security/rate-limit.ts:70-81`) - perf-reviewer (already known)
4. **Compiler Container Concurrency Limit Uses CPU Count Only** (`src/lib/compiler/execute.ts:32`) - perf-reviewer
5. **CSRF Origin Check Bypass via Protocol-Relative Origin** (`src/lib/security/csrf.ts:60-68`) - security-reviewer
6. **Test Seed Endpoint Accepts JSON Without Rate Limit** (`src/app/api/v1/test/seed/route.ts`) - security-reviewer
7. **Docker Build Context Includes Entire Repository** (`src/lib/docker/client.ts:245-246`) - security-reviewer (already known)
8. **No Tests for Error Boundaries** (`src/app/**/error.tsx`) - test-engineer
9. **No Tests for Cursor Pagination Edge Cases** (`src/app/api/v1/submissions/route.ts:51-101`) - test-engineer
10. **No Tests for Compiler Container Cleanup** (`src/lib/compiler/execute.ts:800-894`) - test-engineer
11. **No Tests for CSRF Edge Cases** (`src/lib/security/csrf.ts`) - test-engineer
12. **Custom Store Implementation in useSourceDraft** (`src/hooks/use-source-draft.ts`) - architect
13. **Mixed Auth Patterns Across Routes** (Multiple API routes) - architect

---

## Cross-Agent Agreement

The following findings were flagged by multiple reviewers:
- **use-submission-polling issues:** code-reviewer (parse failure), perf-reviewer (infinite retry)
- **src/lib/api/handler.ts:** code-reviewer (Zod error), architect (monolithic factory)
- **src/lib/audit/events.ts:** perf-reviewer (O(n^2) JSON), test-engineer (missing tests)

---

## Relation to Existing Perspective Reviews

The 6 perspective reviews (student, instructor, job-applicant, admin, assistant, security-researcher) identified 192 findings. This cycle's deep review found 30 NEW findings focused on:
- Code logic and edge cases not visible from user-facing perspective
- Performance characteristics of API endpoints
- Test coverage gaps in core business logic
- Architectural coupling and extensibility risks
- Additional security defense-in-depth items

No overlap with existing CRITICAL findings. The existing CRITICALs (timer drift, anti-cheat bypass, judge result fabrication) were confirmed still present in the codebase.

---

## Recommended Priority for Fixes

1. **Immediate:** C1 - SSE parse failure fallback (breaks live updates)
2. **Short-term:** M13 - No tests for scoring logic (affects fairness), M5-M9 - Performance issues
3. **Medium-term:** M1-M4 - Code quality issues, M10-M12 - Security gaps
4. **Long-term:** LOW items, architecture refactoring
