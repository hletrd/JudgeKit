# Latent Bug Surface Review: JudgeKit

**Reviewer:** debugger
**Date:** 2026-05-11
**Scope:** Latent bugs, failure modes, edge cases, regressions — Cycle 2 of RPF loop

---

## New Findings Summary

| Severity | Count |
|----------|-------|
| MEDIUM   | 1     |
| LOW      | 1     |
| **Total**| **2** |

---

## MEDIUM

### D1: Verify-Email Page Does Not Handle `t()` Returning a Promise (next-intl Async API)
- **File:** `src/app/(auth)/verify-email/page.tsx:19-20,38,40,48`
- **Confidence:** Medium
- **Description:** next-intl v4+ uses the async `getTranslations` API under the hood in server components, but in client components `useTranslations` returns a synchronous function. However, if `t()` is ever called with a missing key, it may return the key string itself or trigger a re-render. The initial state computation at lines 19-20 calls `t("invalidOrExpiredToken")` during render (inside `useState` initializer). If translations are not yet loaded, this could return the raw key or undefined.
- **Failure scenario:** On slow networks or when the translation JSON is large, the initial render may display the raw translation key "invalidOrExpiredToken" instead of the localized text. This is a poor UX for an auth flow.
- **Fix:** Use a static fallback or delay error message display until translations are confirmed loaded. Alternatively, initialize `errorMessage` to empty string and set it in the effect after the token check.

---

## LOW

### D2: Container Cleanup Race Condition in `execute.ts`
- **File:** `src/lib/compiler/execute.ts:401-420`
- **Confidence:** Low
- **Description:** The `cleanup` function sets `cleaned = true` synchronously but the actual container removal (`cleanupContainer`) is async and fire-and-forget. If the process exits and cleanup is triggered from multiple paths (spawn error + process exit), the second path may see `cleaned = true` and skip, but the first `cleanupContainer` may not have started yet. This is a classic TOCTOU pattern.
- **Failure scenario:** Under high load, a rapid spawn-exit cycle could leave orphaned Docker containers. The `.catch(() => {})` masks any failure to remove them.
- **Fix:** The `cleaned` flag already prevents duplicate cleanup calls. The fire-and-forget pattern is intentional for performance. This is a theoretical concern; log the cleanup failure instead of swallowing it (already noted as L1 in code-reviewer).

---

## Edge Cases Checked

- Token absent: handled (sets error state)
- Network failure: handled (catch block)
- 4xx/5xx response: handled (checks `res.ok`)
- Double-submit: NOT handled (no disabled state on buttons during loading)
- Token format validation: NOT handled (sends any string to server)
