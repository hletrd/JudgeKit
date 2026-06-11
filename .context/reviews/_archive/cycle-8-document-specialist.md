# Cycle 8 Document Specialist Review

**Date:** 2026-04-20
**Reviewer:** document-specialist
**Base commit:** ddffef18

## Findings

### DOC-1: Cycle 7 plan M3 status is stale — code already has the fix [INFO/HIGH]

**File:** `plans/open/2026-04-20-cycle-7-review-remediation.md:98`
**Description:** M3 (Fix invite route timestamp clock-skew) shows status "TODO" but the code at `src/app/api/v1/contests/[assignmentId]/invite/route.ts:98` already has `const now = await getDbNowUncached()` and uses `now` for `redeemedAt` and `enrolledAt`. This was fixed in commit 598f52c9.
**Fix:** Update M3 status to DONE.

### DOC-2: Cycle 7 plan L1 status may be stale — tests may already exist [INFO/MEDIUM]

**File:** `plans/open/2026-04-20-cycle-7-review-remediation.md:113`
**Description:** L1 (Add tests for `tokenInvalidatedAt` DB-time usage) shows status "TODO" but test additions were committed (commit f149c200 added db-time mock to affected tests).
**Fix:** Verify test coverage and update L1 status.

### DOC-3: Cycle 24 plan M2 status is stale — code already has the fix [INFO/HIGH]

**File:** `plans/open/2026-04-20-cycle-24-review-remediation.md:57`
**Description:** M2 (Remove stale `/workspace` from public-route-seo.ts) shows status "TODO" but the file no longer contains any `/workspace` reference.
**Fix:** Update M2 status to DONE and archive the plan (all items are DONE).

### DOC-4: Cycle 25 plan M2 status is stale — progress log contradicts the status field [INFO/HIGH]

**File:** `plans/open/2026-04-20-cycle-25-review-remediation.md:80,106`
**Description:** M2 shows status "TODO" on line 80, but the progress log on line 106 says "H1, M1, M2, L1 all DONE". Code inspection confirms all Korean letter-spacing fixes are in place.
**Fix:** Update M2 status to DONE and archive the plan.

## Verified Safe

- CLAUDE.md project rules are accurate and followed (Korean letter-spacing, deployment constraints).
- No code-documentation mismatches found in API route contracts.
