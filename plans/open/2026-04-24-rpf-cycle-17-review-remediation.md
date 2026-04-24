# RPF Cycle 17 — Review Remediation Plan

**Date:** 2026-04-24
**Source:** `.context/reviews/_aggregate.md`
**Status:** Completed

## Scope

This cycle addresses findings from the RPF cycle 17 multi-agent review:
- AGG-1: `hcaptchaSecret` missing from logger REDACT_PATHS (MEDIUM)
- AGG-2: Duplicate audit event pruning systems (LOW)
- AGG-3: Double serialization in `truncateObject` array branch (LOW)
- AGG-4: No test for logger REDACT_PATHS coverage (LOW)
- AGG-5: Access code stored in plaintext (LOW — noted, deferred)
- AGG-6: No unit test for `sanitizeMarkdown` control character stripping (LOW)

No cycle-17 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### M1: Add `hcaptchaSecret` to logger REDACT_PATHS (AGG-1)

- **Source:** AGG-1 (CR-1, S-1, A-1, D-1, V-1, C-1)
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/lib/logger.ts:5-25`
- **Cross-agent signal:** 6 of 8 review perspectives
- **Problem:** The pino logger's `REDACT_PATHS` array does not include `hcaptchaSecret`. The system settings server action and admin API route handle the hCaptcha secret in plaintext before encrypting it for storage. If either code path logs the settings object at error level, the secret could appear unredacted in the log output.
- **Plan:**
  1. Add `"hcaptchaSecret"` and `"body.hcaptchaSecret"` to `REDACT_PATHS` in `src/lib/logger.ts`
  2. Verify all gates pass
- **Status:** Done (492efa63)

### L1: Consolidate duplicate audit event pruning (AGG-2)

- **Source:** AGG-2 (A-2, D-2, V-2)
- **Severity / confidence:** LOW / HIGH
- **Citations:** `src/lib/audit/events.ts:229-250`, `src/lib/data-retention-maintenance.ts:80-95`
- **Cross-agent signal:** 3 of 8 review perspectives
- **Problem:** Two independent systems prune from `auditEvents`. Both use the same retention window and batched-DELETE pattern. Running both is wasteful and creates a maintenance risk.
- **Plan:**
  1. Remove audit event pruning from `src/lib/audit/events.ts` (the `pruneOldAuditEvents` function, its timer setup in `startAuditEventPruning`, and the standalone timer)
  2. Keep `startAuditEventPruning()` as a function that delegates to `startSensitiveDataPruning()` for backward compatibility, or remove if no callers need it
  3. Verify that `src/lib/data-retention-maintenance.ts` already prunes audit events (it does, via `pruneSensitiveOperationalData`)
  4. Verify all gates pass
- **Status:** Done (013e00ae)

### L2: Fix double serialization in `truncateObject` array branch (AGG-3)

- **Source:** AGG-3 (CR-3, P-1)
- **Severity / confidence:** LOW / HIGH
- **Citations:** `src/lib/audit/events.ts:66-70`
- **Cross-agent signal:** 2 of 8 review perspectives
- **Problem:** In the array branch, each item is processed twice (once for budget check via JSON.stringify, once for the actual push). This doubles CPU cost for complex objects.
- **Plan:**
  1. Compute the truncated item once, serialize it for the budget check, and push the already-computed truncated value
  2. Verify existing boundary tests still pass
  3. Verify all gates pass
- **Status:** Done (013e00ae — same commit as L1)

### L3: Add test for logger REDACT_PATHS coverage (AGG-4)

- **Source:** AGG-4 (T-1, C-4)
- **Severity / confidence:** LOW / HIGH
- **Citations:** `src/lib/logger.ts:5-25`, `src/lib/db/export.ts:245-258`
- **Cross-agent signal:** 2 of 8 review perspectives
- **Problem:** No automated test validates that `REDACT_PATHS` covers all known secret columns. This is the same systemic gap that existed for `SANITIZED_COLUMNS` (fixed in cycle 16).
- **Plan:**
  1. Add a unit test that imports `REDACT_PATHS` from `src/lib/logger.ts` and `SANITIZED_COLUMNS`/`ALWAYS_REDACT` from `src/lib/db/export.ts`
  2. For each column in `SANITIZED_COLUMNS` and `ALWAYS_REDACT`, assert the column name (or a reasonable path variant) appears in `REDACT_PATHS`
  3. Also assert `hcaptchaSecret` is in `REDACT_PATHS` (validates M1)
  4. Verify all gates pass
- **Status:** Done (8a453cd4)

### L4: Add unit test for `sanitizeMarkdown` control character stripping (AGG-6)

- **Source:** AGG-6 (T-2)
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/security/sanitize-html.ts:85-88`
- **Cross-agent signal:** 1 of 8 review perspectives
- **Problem:** `sanitizeMarkdown` strips control characters but has no dedicated unit test.
- **Plan:**
  1. Add a unit test for `sanitizeMarkdown` that verifies: null bytes are stripped, other control characters are stripped, newlines/tabs/carriage returns are preserved, normal text passes through unchanged
  2. Verify all gates pass
- **Status:** Already covered — existing tests in `tests/unit/security/sanitize-html.test.ts` include control character stripping for `sanitizeMarkdown`

---

## Deferred items

### AGG-5: Access code stored in plaintext (DEFER-71)

- **Original severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/db/schema.pg.ts:344`
- **Reason for deferral:** This is a known design tradeoff. Access codes are short-lived (tied to contest deadlines), provide limited access (contest participation only, not account takeover), and need to be displayed to instructors. Hashing would require UX changes (display once at creation, like recruiting tokens). The blast radius is limited compared to other secret types.
- **Exit criterion:** If access codes are ever used for higher-privilege access, or if a DB breach scenario analysis shows contest access codes as a high-risk vector, re-open and implement SHA-256 hashing with display-at-creation pattern.

Carry-forward deferrals from prior cycles: DEFER-61 through DEFER-70 remain unchanged.

---

## Progress log

- 2026-04-24: Plan created from RPF cycle 17 aggregate review. 5 new tasks (M1, L1-L4). AGG-5 deferred as DEFER-71.
- 2026-04-24: All tasks completed. M1 (492efa63), L1+L2 (013e00ae), L3 (8a453cd4), L4 already covered by existing tests. Test baseline updated (3f05614a). All gates pass: eslint 0, tsc 0, vitest 2138/2138, next build OK.
