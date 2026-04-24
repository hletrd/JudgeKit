# RPF Cycle 22 Fresh Review Remediation Plan

**Date:** 2026-04-24
**Source:** `.context/reviews/rpf-cycle-22-fresh-aggregate.md`
**Status:** In Progress

## Scope

This cycle addresses new findings from the fresh cycle-22 multi-perspective review:
- AGG-1: Contest stats route uses raw MAX(score) without late penalty
- AGG-2: ICPC live rank query counts all wrong attempts vs only pre-AC wrongs
- AGG-3: Stats endpoint has no unit tests

No cycle-22 fresh review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Fix contest stats to use adjusted score with late penalties (AGG-1)

- **Source:** AGG-1 (CR-1)
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/app/api/v1/contests/[assignmentId]/stats/route.ts:84-110`
- **Problem:** The stats endpoint computes `best_score` as `MAX(s.score)` and uses it for both `avgScore` and `problemsSolvedCount`. For IOI contests with late penalties, this raw score does not match the adjusted score used by the leaderboard. A problem with raw score 100 but penalty-adjusted 90 shows as "solved" in stats but not in the leaderboard.
- **Plan:**
  1. Add LEFT JOIN to `exam_sessions` in the `user_best` CTE to get `personal_deadline`.
  2. Replace `MAX(s.score) AS best_score` with `MAX(buildIoiLatePenaltyCaseExpr(...)) AS best_score` to apply late penalties consistently with the leaderboard.
  3. Fetch `deadline`, `latePenalty`, `examMode` from the assignment row (already partially available via the `assignment` query at the top of the handler).
  4. Pass the additional parameters (`deadline`, `latePenalty`, `examMode`) to the raw query.
  5. Verify all gates pass.
- **Status:** DONE

### L1: Fix ICPC live rank wrongBeforeAc to match main leaderboard (AGG-2)

- **Source:** AGG-2 (CR-2)
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/assignments/leaderboard.ts:128-131`
- **Problem:** The `computeSingleUserLiveRank` ICPC query counts ALL wrong attempts (`attempt_count - has_ac`) instead of only pre-AC wrongs. The main leaderboard uses a window function for `wrongBeforeAc`.
- **Plan:**
  1. Add a window-function-based `wrongBeforeAc` computation to the `user_score` CTE in the ICPC live rank query, matching the pattern in `contest-scoring.ts` lines 177-179.
  2. Replace `us.attempt_count - us.has_ac` with `us.wrong_before_ac` in the penalty calculation.
  3. Verify all gates pass.
- **Status:** DONE

### M1: Add unit tests for contest stats endpoint (AGG-3)

- **Source:** AGG-3 (CR-3)
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/app/api/v1/contests/[assignmentId]/stats/route.ts`
- **Problem:** Zero test coverage for the stats route. The scoring inconsistency with the leaderboard (AGG-1) went undetected.
- **Plan:**
  1. Create test file `tests/unit/api/contest-stats.route.test.ts`.
  2. Test IOI with late penalties: verify stats match leaderboard-adjusted scoring.
  3. Test ICPC: verify solved count and average score.
  4. Test edge cases: no submissions, single participant, all-zero scores.
  5. Verify all gates pass.
- **Status:** DONE

---

## Deferred items

### DEFER-1: Practice page progress-filter SQL CTE optimization (carried from cycle 18)

- **Source:** rpf-cycle-18 DEFER-1 through rpf-cycle-21 DEFER-1
- **Severity / confidence:** MEDIUM / MEDIUM
- **Original severity preserved:** MEDIUM / MEDIUM
- **Citations:** `src/app/(public)/practice/page.tsx:410-519`
- **Reason for deferral:** Significant refactoring scope. Current code works correctly for existing problem counts. Deferred since cycle 18 with no change.
- **Exit criterion:** Problem count exceeds 5,000 or a performance benchmark shows >2s page load time with progress filters.

### DEFER-2: `SubmissionListAutoRefresh` polling backoff (carried from cycle 19)

- **Source:** rpf-cycle-19 DEFER-2 through rpf-cycle-21 DEFER-2
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/submission-list-auto-refresh.tsx:22-28`
- **Reason for deferral:** Works correctly for normal operation. Visibility check prevents unnecessary refreshes.
- **Exit criterion:** Users report performance issues during server overload, or a standardized polling pattern with backoff is established.

### DEFER-3: Audit `forceNavigate` call sites (carried from cycle 19)

- **Source:** rpf-cycle-19 DEFER-3 through rpf-cycle-21 DEFER-3
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/lib/navigation/client.ts:3-5`
- **Reason for deferral:** `forceNavigate` is used intentionally. Not causing issues.
- **Exit criterion:** When a navigation bug is traced to `forceNavigate` being used where `router.push()` would suffice.

### DEFER-4: Mobile sign-out button touch target size (carried from cycle 19)

- **Source:** rpf-cycle-19 DEFER-4 through rpf-cycle-21 DEFER-4
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/layout/public-header.tsx:318-326`
- **Reason for deferral:** Current touch target (~36px) meets WCAG 2.2 minimum of 24px. UX refinement, not a bug.
- **Exit criterion:** When a mobile UX audit is performed, or when users report difficulty tapping the sign-out button.

### DEFER-5: Practice page decomposition -- extract data module (carried from cycle 18)

- **Source:** rpf-cycle-18 DEFER-2 through rpf-cycle-21 DEFER-5
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/app/(public)/practice/page.tsx` (716 lines)
- **Reason for deferral:** Should be combined with DEFER-1. Extracting without fixing the query creates same issue in new module.
- **Exit criterion:** DEFER-1 is picked up, or the page exceeds 800 lines.

### DEFER-6: `use-unsaved-changes-guard.ts` uses `window.confirm()` (carried from cycle 20)

- **Source:** rpf-cycle-20 DEFER-6 through rpf-cycle-21 DEFER-6
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/hooks/use-unsaved-changes-guard.ts:107`
- **Reason for deferral:** Conventional UX pattern for navigation guards. Replacing with AlertDialog requires significant API changes.
- **Exit criterion:** When a design decision is made to use custom dialogs for all confirmations, or when a reusable async confirmation hook is created.

### DEFER-7: `document.execCommand("copy")` deprecated fallback (carried from prior cycle 21)

- **Source:** prior cycle-21 DEFER-7
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/code/copy-code-button.tsx:29`, `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:224`
- **Reason for deferral:** The fallback currently works in all major browsers. No browser has removed `execCommand("copy")` yet.
- **Exit criterion:** A major browser removes `execCommand("copy")`, or a shared clipboard utility is implemented across the codebase.

### DEFER-8: `restore/route.ts` `.toFixed(1)` in audit log (carried from prior cycle 21)

- **Source:** prior cycle-21 DEFER-8
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/app/api/v1/admin/restore/route.ts:154-155`
- **Reason for deferral:** Server-side audit log string, not user-facing UI. The format is for admin consumption only.
- **Exit criterion:** When the formatting module is made server-side compatible, or when audit logs need to be localized.

### DEFER-9: `allImageOptions` rebuilt every render (carried from prior cycle 21)

- **Source:** prior cycle-21 DEFER-9
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:274`
- **Reason for deferral:** The array is small (~15 items) and the sort is trivial. Performance impact is negligible.
- **Exit criterion:** When the image options list grows significantly, or when the component is refactored.

### DEFER-10: Settings secret field redaction duplication (carried from prior cycle 21)

- **Source:** prior cycle-21 DEFER-10
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/app/api/v1/admin/settings/route.ts:21-25, 131-135` and `src/lib/actions/system-settings.ts:186`
- **Reason for deferral:** The current redaction works correctly for all known secret fields. The duplication is a DRY violation that increases maintenance burden. Fixing this requires creating a shared helper and updating multiple callers, which is refactor-only work.
- **Exit criterion:** When a new secret field is added to systemSettings, or when the admin settings API is refactored.

### DEFER-11: `decrypt()` `allowPlaintextFallback: true` in hcaptcha verification (carried from prior cycle 21)

- **Source:** prior cycle-21 DEFER-11
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/lib/security/hcaptcha.ts:23`
- **Reason for deferral:** The plaintext fallback is needed for backward compatibility during migration from plaintext to encrypted storage. Production default for `allowPlaintextFallback` is `false`, so the explicit `true` override is only needed for the hcaptcha column which may still have plaintext values.
- **Exit criterion:** When all hcaptchaSecret values in the DB are confirmed encrypted (verified by a migration or startup check), the `allowPlaintextFallback: true` can be removed.

---

## Progress log

- 2026-04-24: Plan created from fresh cycle-22 aggregate review. 3 findings, 2 fix tasks, 1 test task.
- 2026-04-24: H1 DONE -- stats route now uses buildIoiLatePenaltyCaseExpr for consistent scoring.
- 2026-04-24: L1 DONE -- ICPC live rank query now uses window-function-based wrongBeforeAc.
- 2026-04-24: M1 DONE -- added 13 source-grep tests for contest stats route.
- 2026-04-24: All gates green (tsc, eslint, vitest, next build).
