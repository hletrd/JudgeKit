# Debugger Review — RPF Cycle 2 (2026-05-04)

**Reviewer:** debugger
**HEAD reviewed:** `767b1fee`

---

## Latent bug surface scan

### TypeScript / ESLint status

- `npx tsc --noEmit`: 0 errors at HEAD (verified via prior cycle).
- ESLint: 0 errors in `src/`.

### Recent changes regression analysis

#### ConditionalHeader (commit `767b1fee`)
- **Regression risk:** LOW — New component, no existing behavior modified. The `startsWith("/dashboard/admin")` check is straightforward.
- **Edge case:** Nested admin routes like `/dashboard/admin/settings` correctly match the prefix.

#### i18n fixes (commit `95cbcf6a`)
- **Regression risk:** LOW — Translation keys added, hardcoded strings removed. Existing tests updated.

#### Discussions refactor (commit `82e1ea9e`)
- **Regression risk:** LOW — SQL filters replace JS filters. The `conditions` array is properly built with `and()` when non-empty, `undefined` when empty (which means no filter — same as before).

#### Code similarity (commit `7f29d897`)
- **Regression risk:** LOW — `performance.now()` is a drop-in replacement for `Date.now()` timing. Both return milliseconds.

---

## Findings

### C2-DB-1: [LOW] `latestSubmittedAt` mixed-type comparison

- **File:** `src/lib/assignments/submissions.ts:625-627`
- **Confidence:** MEDIUM (carry-forward from C1-DB-1)
- **Description:** The comparison `row.latestSubmittedAt > existing.latestSubmittedAt` operates on `string | Date | null`. Potential incorrect ordering under specific driver/timezone configurations.
- **Status:** Carry-forward. No regression.

---

## No new debugger findings this cycle.

All recent changes have low regression risk. No latent bugs introduced.
