# Cycle 10 Review Remediation Plan

**Date:** 2026-05-03
**Source:** `.context/reviews/_aggregate-cycle-10.md`
**Status:** IN PROGRESS

---

## Tasks

### Task A: [MEDIUM] Fix privacy page hardcoded retention periods — derive from DATA_RETENTION_DAYS
- **Source:** C10-1
- **File:** `src/app/(public)/privacy/page.tsx:38-44`
- **Problem:** Hardcoded retention period strings ("90", "30", "180", "365", "365") may diverge from the configured `DATA_RETENTION_DAYS` values in `src/lib/data-retention.ts` when operators change retention periods via environment variables.
- **Fix:** Derive retention day values from `DATA_RETENTION_DAYS` on the server side. Since this is a server component, import `DATA_RETENTION_DAYS` directly and use its values instead of hardcoded strings. Also add the missing `loginEvents` data class (Task B).
- **Exit criteria:** Privacy page displays retention periods that match `DATA_RETENTION_DAYS`, and an assertion or dev-mode check flags divergence.
- [ ] Not started

### Task B: [LOW] Add missing `loginEvents` data class to privacy page
- **Source:** C10-2
- **File:** `src/app/(public)/privacy/page.tsx:38-44`
- **Problem:** `loginEvents` (180-day retention) is defined in `DATA_RETENTION_DAYS` but not listed on the privacy page. Users are not informed about the retention of their login event history.
- **Fix:** Add `{ key: "loginEvents", retention: String(DATA_RETENTION_DAYS.loginEvents) }` to the `dataClasses` array. Also add corresponding i18n keys in `messages/en.json` and `messages/ko.json`.
- **Exit criteria:** Privacy page lists `loginEvents` with the correct retention period.
- [ ] Not started

### Task C: [MEDIUM] Add NaN/finite guard in `computeRecruitResultsTotals`
- **Source:** C10-3
- **File:** `src/lib/assignments/recruiting-results.ts:84-89`
- **Problem:** If `best.score` is NaN or infinity (corrupted submission record), `mapSubmissionPercentageToAssignmentPoints` will propagate NaN through the `totalScore` accumulator, causing the candidate results page to display NaN.
- **Fix:** Add a `Number.isFinite(best.score)` guard before calling `mapSubmissionPercentageToAssignmentPoints`. Skip entries with non-finite scores.
- **Exit criteria:** `computeRecruitResultsTotals` never returns NaN in `totalScore` or `adjustedByProblem`, even with non-finite input scores.
- [ ] Not started

### Task D: [LOW] Preserve `_sys.*` keys during metadata update in `updateRecruitingInvitation`
- **Source:** C10-4
- **File:** `src/lib/assignments/recruiting-invitations.ts:293-330`
- **Problem:** `updateRecruitingInvitation` replaces the entire metadata object when `data.metadata` is provided, which removes existing `_sys.*` keys (e.g., `failedRedeemAttempts` counter, `accountPasswordResetRequired` flag). An admin update could inadvertently reset the brute-force counter.
- **Fix:** Read existing metadata, merge the new metadata over it while preserving `_sys.*` keys, then write the merged result. This prevents accidental removal of security-relevant internal flags.
- **Exit criteria:** Updating invitation metadata preserves existing `_sys.*` keys from the prior metadata.
- [ ] Not started

### Task E: [LOW] Add URL length guard in `buildSocialImageUrl`
- **Source:** C10-5
- **File:** `src/lib/seo.ts:124-152`
- **Problem:** The social image URL built from query parameters can potentially exceed URL length limits (2048-8192 chars) when all options are provided with maximum-length strings.
- **Fix:** After building the URL, check its length. If it exceeds 2000 characters (safe limit for most servers/browsers), omit the optional parameters (section, badge, meta, footer) one by one from last to first until the URL is within limits.
- **Exit criteria:** `buildSocialImageUrl` never returns a URL longer than 2000 characters.
- [ ] Not started

---

## Deferred findings (no action this cycle)

| ID | Severity | Reason for deferral | Exit criterion |
|---|---|---|---|
| C10-5 | LOW | Low confidence, low impact — social image URLs are typically well under limits in practice | URL length causes a 414 in production logs |
| All carry-forward items from cycle 9 | Various | See `_aggregate-cycle-10.md` for full list | See individual exit criteria |

Note: C10-5 is listed both as Task E (we will implement) and as deferred (if we run out of time). The implementation is simple enough that it should be completed.

---

## Task dependencies

- Task B depends on Task A (both modify the same `dataClasses` array; do them together)
- Tasks C, D, E are independent of each other and of A/B

---

## Implementation order

1. Task A + Task B (privacy page — single commit modifying one file + i18n)
2. Task C (recruiting results NaN guard — single commit)
3. Task D (metadata merge preservation — single commit)
4. Task E (SEO URL length guard — single commit)
5. Run all gates (eslint, next build, vitest, tsc --noEmit)
6. Fix any gate failures
7. Push and deploy
