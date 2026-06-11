# Aggregate Review -- Cycle 21/100 (Re-review at HEAD e38d974c)

**Date:** 2026-05-09
**HEAD:** e38d974c
**Reviewers:** manual comprehensive sweep
**Scope:** Full repository re-review focusing on new changes since previous cycle-21 review (17ae0bda)

---

## Context

Previous cycle-21 review (at 17ae0bda) identified 4 findings (C21-1 through C21-4). All 4 have been verified as FIXED at current HEAD:
- C21-1 (import timestamp dataType): Fixed -- `src/lib/db/import.ts:33` now checks `"timestamp"`
- C21-2 (auto-review plugin config cast): Fixed -- `src/lib/judge/auto-review.ts:93` uses `chatWidgetConfigSchema.safeParse`
- C21-3 (use-mobile inconsistent detection): Fixed -- `src/hooks/use-mobile.ts:14` uses `mql.matches`
- C21-4 (keyboard shortcuts modifier block): Fixed -- `src/hooks/use-keyboard-shortcuts.ts` has full modifier support

This aggregate covers NEW findings at HEAD e38d974c.

---

## Total Deduplicated NEW Findings

**0 HIGH, 0 MEDIUM, 4 LOW**

---

## Findings

### C21-N1: submission-status-badge.test.tsx has orphaned it() blocks outside describe() [LOW]
- **Severity:** LOW
- **Confidence:** HIGH
- **File+line:** `tests/component/submission-status-badge.test.tsx:169-195`
- **Issue:** The `describe()` block closes at line 169, but two `it()` blocks ("shows the TLE tooltip..." and "shows the runtime error label...") at lines 172-195 are outside the describe block. While vitest runs them as top-level tests, this is a structural error that breaks test organization and could cause confusion or ordering issues.
- **Fix:** Move lines 172-195 inside the `describe("SubmissionStatusBadge", () => {` block, before the closing `});` at line 169.

### C21-N2: ResourceUsageBar component has no unit/component tests [LOW]
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/components/resource-usage-bar.tsx` (new)
- **Issue:** The new `ResourceUsageBar` component (102 lines, introduced in e38d974c) has zero test coverage. No tests verify: color thresholds (green/yellow/orange/red), percentage clamping, compact vs full mode, formatValue conversions (ms->s, KB->MB, MB->GB), or edge cases (limit=0, exceeded=true).
- **Fix:** Add component tests in `tests/component/resource-usage-bar.test.tsx`.

### C21-N3: ResourceUsageBar uses non-locale-aware number formatting [LOW]
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/components/resource-usage-bar.tsx:36-47`
- **Issue:** `formatValue` uses `Math.round()` and `.toFixed()` without locale awareness. This creates inconsistency with `formatBadgeNumber()` (used in tooltip TLE display and submission detail) which respects the user's locale. For example, a Korean user sees "2,013 ms" in the tooltip but "2013ms" in the resource usage bar.
- **Fix:** Use `Intl.NumberFormat` or the existing `formatNumber` utility in `formatValue` to respect locale.

### C21-N4: ResourceUsageBar doesn't guard against NaN or negative inputs [LOW]
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/resource-usage-bar.tsx:58-60`
- **Issue:** If `current` or `limit` contains `NaN` (from corrupted DB data) or negative values, `percentage` becomes `NaN` or negative. `clampedPercentage = Math.min(NaN, 100)` is `NaN`, producing `style={{ width: "NaN%" }}` which is invalid CSS. Negative values produce negative-width bars.
- **Fix:** Add defensive guards: `if (!Number.isFinite(current) || current < 0) current = 0;` and `if (!Number.isFinite(limit) || limit <= 0) return fallback UI;`

---

## Areas Verified (No Issues Found)

- **All 4 previous cycle-21 findings:** Verified fixed at HEAD.
- **All cycle-20 findings:** Verified fixed at HEAD (keyboard shortcuts modifiers, locale switcher Secure flag, unsaved changes guard singleton).
- **Event listener cleanup:** All addEventListener calls have matching removeEventListener.
- **Timer cleanup:** All setTimeout/setInterval usages have proper cleanup.
- **RAF cleanup:** All requestAnimationFrame usages have matching cancelAnimationFrame.
- **JSON.parse guards:** All JSON.parse calls have try/catch or are in safe contexts.
- **SQL injection:** All raw SQL uses parameterized/drizzle-orm safe patterns.
- **XSS:** User content is sanitized before dangerouslySetInnerHTML.
- **Korean letter spacing:** All `tracking-*` usages respect the locale guard.
- **i18n keys:** New "time" and "memory" keys properly added to both en.json and ko.json.
- **Gates:** eslint, tsc --noEmit, next build, vitest integration (314 files / 2352 tests), vitest component (67 files / 189 tests) -- ALL PASS.

---

## Deferred Items

None new. All prior deferred items remain deferred with unchanged exit criteria.

---

## Review Methodology

- Full reads of all files changed since previous cycle-21 review (diff 17ae0bda..HEAD)
- Grep sweeps for: RAF, timers, JSON.parse, event listeners, tracking-*, innerHTML, eval, sql.raw
- Verification of all previous cycle findings at HEAD
- All gates run and verified green
