# Cycle 28 Document Specialist Review

**Date:** 2026-04-20
**Reviewer:** document-specialist
**Base commit:** d4489054

## Findings

### DOC-1: `compiler-client.tsx` uses `defaultValue` on `t()` calls — possible missing i18n keys [LOW/LOW]

**File:** `src/components/code/compiler-client.tsx`
**Problem:** The compiler client uses `t("key", { defaultValue: "English fallback" })` extensively. No other component in the codebase uses this pattern. This suggests the `compiler.*` translation keys may not be properly registered in the locale files, and the `defaultValue` parameters are masking missing translations.

The codebase convention (seen in all other components) is to use `t("key")` without `defaultValue`, relying on the translation files to provide the text. If a key is missing, it should be caught during development rather than silently falling back to English.

**Fix:** Verify all `compiler.*` keys exist in both locale files. Remove `defaultValue` if keys are present. Add missing keys if not.

### DOC-2: `sign-out.ts` storage prefix list may need updating for new localStorage keys [LOW/LOW]

**File:** `src/lib/auth/sign-out.ts:18-24`
**Problem:** The `APP_STORAGE_PREFIXES` list documents known localStorage prefixes. The `compiler:` prefix is listed with a reference to `compiler-client.tsx`. However, the `submission-detail-client.tsx` at line 94 writes to `localStorage` using the `oj:submission-draft:` prefix (via the `use-source-draft` key format), which is already covered by the `"oj:"` prefix in the list. No missing prefixes found.

**Status:** No action needed — the prefix list is up to date.
