# Cycle 2/3 — Debugger

**HEAD:** main / 2198a39b

## Latent bugs surfaced this cycle

### B2-01 — `(dashboard)/layout.tsx` imports `getActiveTimedAssignmentsForSidebar` but never calls it — LOW / HIGH
- File: `src/app/(dashboard)/layout.tsx:14`
- Symptom: dead import survives lint because it's used as a runtime import (verify). Actually triggers `@typescript-eslint/no-unused-vars` or ESLint `unused-imports`. Run baseline shows clean — likely allowed because it's currently destructured into a const that's never used.
- Fix: drop the import. Resolves with cycle-2 sidebar deletion.

### B2-02 — Pre-existing `tests/unit/custom-role-pages-implementation.test.ts` failure since pre-cycle-1 — MEDIUM / HIGH
- Already documented in cycle-1 plan §"DEFERRED GATE FAILURES".

### B2-03 — Pre-existing `tests/unit/platform-mode-ui-implementation.test.ts` failure since pre-cycle-1 — MEDIUM / HIGH
- Already documented.

### B2-04 — Avatar dropdown shows "Admin" before caps resolve — LOW / MEDIUM
- File: `src/lib/navigation/public-nav.ts:99-101`
- Symptom: when `capabilities` is `undefined`, the cap-gated `Admin` entry is hidden via `?? false`. On client-side hydration if caps are passed in, no flicker. On server-side, layout passes caps in. Risk only in client islands that reconstruct the dropdown without caps. Not currently an active bug.
- Fix: defensive — log a warning when capabilities is undefined in non-test contexts.

### B2-05 — `getPublicNavItems(t)` rendered to BOTH layouts but with different translation roots — LOW / HIGH
- Both layouts use `getTranslations("publicShell")`. Verified consistent.
- No bug; record only.

## Verdict
No newly-introduced bugs since cycle 1. Two old test failures and a dead import, all cleanable with the architect's recommended single change set.
