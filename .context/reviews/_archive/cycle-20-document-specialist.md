# Document Specialist — Cycle 20

**Date:** 2026-04-20
**Base commit:** e1c66ae2

## Findings

### DOC-1: JSDoc for `formatNumber` says to prefer it over `.toFixed()` — but dashboard pages still use `.toFixed()` [LOW/MEDIUM]

**File:** `src/lib/formatting.ts:15-18`

**Description:** The JSDoc states "Prefer this over `.toLocaleString('en-US')` or `.toFixed()` for any user-facing number display". However, 2 dashboard pages still define their own `formatDifficultyValue` using `.toFixed()`. The documentation is correct but the codebase has not fully adopted the documented policy.

**Fix:** Centralize `formatDifficulty` in `formatting.ts` and update dashboard pages to import it.

### DOC-2: `datetime.ts` deprecation notice for `formatNumber` is correct [INFO]

**File:** `src/lib/datetime.ts:56-61`

**Description:** The re-export of `formatNumber` from `datetime.ts` is properly marked as `@deprecated` with a clear migration message. This is correctly documented.

## Verified Safe

- Navigation JSDoc is accurate and maintained
- Public nav module documentation matches implementation
