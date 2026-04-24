# RPF Cycle 21 Review Remediation Plan

**Date:** 2026-04-24
**Source:** `.context/reviews/rpf-cycle-21-aggregate.md`
**Status:** In Progress

## Scope

This cycle addresses the new findings from the cycle-21 multi-perspective review:
- AGG-1: Anti-cheat heartbeat dedup uses `Date.now()` instead of DB time
- AGG-2: `systemSettings` cache invalidation race returns defaults
- AGG-3: No test verifying export redaction map consistency with known secret columns

No cycle-21 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Fix anti-cheat heartbeat dedup to use DB time (AGG-1)

- **Source:** AGG-1 (CR-1, S-1, A-1, D-1, T-1)
- **Severity / confidence:** MEDIUM / HIGH
- **Cross-agent signal:** 5 of 6 review perspectives
- **Citations:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:92-96`
- **Problem:** The heartbeat deduplication uses `Date.now()` to decide whether 60 seconds have elapsed since the last heartbeat, while the contest boundary checks in the same handler use `SELECT NOW()` from the DB server. Under clock skew, heartbeats may be inserted more or less frequently than intended, and the in-memory LRU cache timestamps are inconsistent with DB timestamps.
- **Plan:**
  1. Replace `Date.now()` on line 92 with `now.getTime()` where `now` is the DB time already fetched on line 67.
  2. Replace `Date.now()` on line 96 with `now.getTime()` for the cache set.
  3. Verify all gates pass.
- **Status:** DONE

### M1: Fix systemSettings cache invalidation to preserve previous values during async reload (AGG-2)

- **Source:** AGG-2 (CR-3, D-2)
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/lib/system-settings-config.ts:186-189`
- **Problem:** When `invalidateSettingsCache()` is called, it clears `cached = null, cachedAt = 0`. The next `getConfiguredSettings()` call triggers an async reload but returns defaults while the reload is in progress. A concurrent request between invalidation and reload completion will see default rate limits and other settings.
- **Plan:**
  1. Modify `invalidateSettingsCache()` to preserve the previous `cached` value instead of clearing it to null.
  2. Set `cachedAt = 0` to force a reload, but keep `cached` intact so `getConfiguredSettings()` returns the previous (still valid) values until the new ones are loaded.
  3. Verify all gates pass.
- **Status:** DONE

### M2: Add test for export redaction map consistency with known secret columns (AGG-3)

- **Source:** AGG-3 (T-2)
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/db/export.ts:245-260`
- **Problem:** No test validates that `ALWAYS_REDACT` and `SANITIZED_COLUMNS` include entries for all known secret columns. The hcaptchaSecret omission was caught in cycle 19 but could recur without a test.
- **Plan:**
  1. Create a test file `tests/unit/db/export-redaction.test.ts`.
  2. Assert `ALWAYS_REDACT` includes `passwordHash`, `encryptedKey`, `hcaptchaSecret`.
  3. Assert `SANITIZED_COLUMNS` includes all `ALWAYS_REDACT` entries plus session tokens and worker secrets.
  4. Assert that any column in `REDACT_PATHS` in the logger is also present in `SANITIZED_COLUMNS`.
  5. Verify all gates pass.
- **Status:** DONE

---

## Deferred items

### DEFER-1: Practice page progress-filter SQL CTE optimization (carried from cycle 18)

- **Source:** rpf-cycle-18 DEFER-1, rpf-cycle-19 DEFER-1, rpf-cycle-20 DEFER-1, prior cycle-21 DEFER-1
- **Severity / confidence:** MEDIUM / MEDIUM
- **Original severity preserved:** MEDIUM / MEDIUM
- **Citations:** `src/app/(public)/practice/page.tsx:410-519`
- **Reason for deferral:** Significant refactoring scope. Current code works correctly for existing problem counts. Deferred since cycle 18 with no change.
- **Exit criterion:** Problem count exceeds 5,000 or a performance benchmark shows >2s page load time with progress filters.

### DEFER-2: `SubmissionListAutoRefresh` polling backoff (carried from cycle 19)

- **Source:** rpf-cycle-19 DEFER-2, rpf-cycle-20 DEFER-2, prior cycle-21 DEFER-2
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/submission-list-auto-refresh.tsx:22-28`
- **Reason for deferral:** Works correctly for normal operation. Visibility check prevents unnecessary refreshes.
- **Exit criterion:** Users report performance issues during server overload, or a standardized polling pattern with backoff is established.

### DEFER-3: Audit `forceNavigate` call sites (carried from cycle 19)

- **Source:** rpf-cycle-19 DEFER-3, rpf-cycle-20 DEFER-3, prior cycle-21 DEFER-3
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/lib/navigation/client.ts:3-5`
- **Reason for deferral:** `forceNavigate` is used intentionally. Not causing issues.
- **Exit criterion:** When a navigation bug is traced to `forceNavigate` being used where `router.push()` would suffice.

### DEFER-4: Mobile sign-out button touch target size (carried from cycle 19)

- **Source:** rpf-cycle-19 DEFER-4, rpf-cycle-20 DEFER-4, prior cycle-21 DEFER-4
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/layout/public-header.tsx:318-326`
- **Reason for deferral:** Current touch target (~36px) meets WCAG 2.2 minimum of 24px. UX refinement, not a bug.
- **Exit criterion:** When a mobile UX audit is performed, or when users report difficulty tapping the sign-out button.

### DEFER-5: Practice page decomposition -- extract data module (carried from cycle 18)

- **Source:** rpf-cycle-18 DEFER-2, rpf-cycle-20 DEFER-5, prior cycle-21 DEFER-5
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/app/(public)/practice/page.tsx` (716 lines)
- **Reason for deferral:** Should be combined with DEFER-1. Extracting without fixing the query creates same issue in new module.
- **Exit criterion:** DEFER-1 is picked up, or the page exceeds 800 lines.

### DEFER-6: `use-unsaved-changes-guard.ts` uses `window.confirm()` (carried from cycle 20)

- **Source:** rpf-cycle-20 DEFER-6, prior cycle-21 DEFER-6
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/hooks/use-unsaved-changes-guard.ts:107`
- **Reason for deferral:** Conventional UX pattern for navigation guards. Replacing with AlertDialog requires significant API changes.
- **Exit criterion:** When a design decision is made to use custom dialogs for all confirmations, or when a reusable async confirmation hook is created.

### DEFER-7: `document.execCommand("copy")` deprecated fallback (carried from prior cycle 21)

- **Source:** prior cycle-21 DEFER-7 (AGG-8)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/code/copy-code-button.tsx:29`, `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:224`
- **Reason for deferral:** The fallback currently works in all major browsers. No browser has removed `execCommand("copy")` yet.
- **Exit criterion:** A major browser removes `execCommand("copy")`, or a shared clipboard utility is implemented across the codebase.

### DEFER-8: `restore/route.ts` `.toFixed(1)` in audit log (carried from prior cycle 21)

- **Source:** prior cycle-21 DEFER-8 (AGG-9)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/app/api/v1/admin/restore/route.ts:154-155`
- **Reason for deferral:** Server-side audit log string, not user-facing UI. The format is for admin consumption only.
- **Exit criterion:** When the formatting module is made server-side compatible, or when audit logs need to be localized.

### DEFER-9: `allImageOptions` rebuilt every render (carried from prior cycle 21)

- **Source:** prior cycle-21 DEFER-9 (AGG-10)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:274`
- **Reason for deferral:** The array is small (~15 items) and the sort is trivial. Performance impact is negligible.
- **Exit criterion:** When the image options list grows significantly, or when the component is refactored.

### DEFER-10: Settings secret field redaction duplication (AGG-2 from code-reviewer, A-2 from architect)

- **Source:** CR-2, A-2
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/app/api/v1/admin/settings/route.ts:21-25, 131-135` and `src/lib/actions/system-settings.ts:186`
- **Reason for deferral:** The current redaction works correctly for all known secret fields. The duplication is a DRY violation that increases maintenance burden, but the hcaptchaSecret redaction was correctly added in both locations. Fixing this requires creating a shared helper and updating multiple callers, which is refactor-only work.
- **Exit criterion:** When a new secret field is added to systemSettings (the risk of missing a location will be higher), or when the admin settings API is refactored.

### DEFER-11: `decrypt()` `allowPlaintextFallback: true` in hcaptcha verification (S-2)

- **Source:** S-2
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/lib/security/hcaptcha.ts:23`
- **Reason for deferral:** The plaintext fallback is needed for backward compatibility during migration from plaintext to encrypted storage. Production default for `allowPlaintextFallback` is `false`, so the explicit `true` override is only needed for the hcaptcha column which may still have plaintext values. Adding a startup check would be new functionality beyond the scope of fixing a specific bug.
- **Exit criterion:** When all hcaptchaSecret values in the DB are confirmed encrypted (verified by a migration or startup check), the `allowPlaintextFallback: true` can be removed.

---

## Progress log

- 2026-04-24: Plan created from cycle-21 aggregate review. Archived prior cycle-21 plan (was from different numbering system, all items done).
