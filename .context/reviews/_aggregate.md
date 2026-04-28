# Aggregate Review — Cycle 8

**Date:** 2026-04-28
**Reviewers:** code-reviewer (1 lane — focused verification + new findings)
**Total findings:** 0 HIGH, 3 MEDIUM, 4 LOW (deduplicated, new findings only)

---

## Cycle 1-7 Fix Verification Summary

All 29 tasks from cycles 1-7 were re-verified:

| Cycle | Task | Description | Status |
|-------|------|-------------|--------|
| C1 | A | totalPoints reduce initial value | VERIFIED |
| C1 | B | examDurationMinutes in assignmentContext | VERIFIED |
| C1 | C | Redundant getExamSession fallback | VERIFIED |
| C1 | D | Dark mode badges on contest detail | VERIFIED |
| C1 | E | Layout upstream comment | VERIFIED |
| C2 | A | My Contests dark mode badges | VERIFIED |
| C2 | B | DEFAULT_PROBLEM_POINTS constant | VERIFIED |
| C2 | C | Import route type guard | VERIFIED |
| C2 | D | Regression tests | VERIFIED |
| C2 | E | assignmentId on Virtual Practice links | VERIFIED |
| C2 | F | locale passed to formatScore | VERIFIED |
| C2 | G | Shared getContestStatusBorderClass | VERIFIED |
| C2 | H | Parallelized queries | VERIFIED |
| C3 | A | Badge color shades standardized | VERIFIED |
| C3 | B | Shared formatDateLabel utility | VERIFIED |
| C3 | C | Dashboard `?? 100` replaced | VERIFIED |
| C3 | D | Redundant getExamSession in problem detail | VERIFIED |
| C4 | A | Dashboard dark mode badge variants | VERIFIED |
| C4 | B | formatScore locale in public submissions | VERIFIED |
| C4 | C | formatScore locale in dashboard pages | VERIFIED |
| C5 | A | Dashboard contests page uses shared getContestStatusBorderClass | VERIFIED |
| C5 | B | formatScore in 4 dashboard views | VERIFIED |
| C5 | C | Removed misleading `as string | Date` cast | VERIFIED |
| C5 | D | SubmissionStatusBadge locale prop passed by all callers | VERIFIED |
| C6 | A | Extract getStatusBadgeVariant to shared utility | VERIFIED |
| C6 | B | Scoring model badge in My Contests | VERIFIED |
| C6 | C | dark:text-white on 5 public contest badges | VERIFIED |
| C7 | A | formatDifficulty locale in dashboard problems | VERIFIED |
| C7 | B | Contest status badge in enrolled contest detail | VERIFIED |
| C7 | C | Extract inline badge class strings to shared utility | VERIFIED |

All cycle 1-7 fixes are correctly implemented. No regressions found.

---

## Deduplicated Findings (sorted by severity)

### C8-AGG-1: [MEDIUM] `formatBytes` called without locale in 3 client component locations

**Sources:** C8-CR-1 | **Confidence:** HIGH

Three client-side `formatBytes` calls omit the `locale` argument, defaulting to `en-US`:

- `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:893` — `formatBytes(testCase.input.length)`
- `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:934` — `formatBytes(testCase.expectedOutput.length)`
- `src/components/code/compiler-client.tsx:115` — `formatBytes(content.length)`

Every other `formatBytes` call site in the codebase passes locale. This is the same bug class as C4-B/C (formatScore missing locale) and C7-AGG-1 (formatDifficulty missing locale), which were fixed in cycles 4-5 and 7 respectively.

Neither `create-problem-form.tsx` nor `compiler-client.tsx` imports `useLocale` currently. Both are `"use client"` components.

**Fix:** Import `useLocale` from `next-intl` in both components and pass locale to all `formatBytes` calls.

---

### C8-AGG-2: [MEDIUM] `formatNumber` called without locale in `system-info.ts`

**Sources:** C8-CR-2 | **Confidence:** MEDIUM

`src/lib/system-info.ts:63` calls `formatNumber(speedMHz / 1000, { maximumFractionDigits: 1 })` without `locale`, defaulting to `en-US`. This is a server-side system introspection utility. The severity is moderate because CPU frequency is technical data typically shown in `en-US` format, but it is inconsistent with the codebase's approach.

**Fix:** Either pass locale through the call chain, or add a comment documenting the deliberate `en-US` default for technical data.

---

### C8-AGG-3: [MEDIUM] Contest status labels duplicated across 3 files instead of shared utility

**Sources:** C8-CR-3 | **Confidence:** HIGH

The contest status label map (`upcoming|open|in_progress|expired|closed` -> translated labels) is defined locally in 3 separate files:

- `src/app/(public)/contests/page.tsx:57-62` — `statusLabels`
- `src/app/(public)/contests/[id]/page.tsx:107-113` — `statusLabels`
- `src/app/(dashboard)/dashboard/contests/page.tsx:91-97` — `statusLabelMap`

This is the same class of duplication as C2-AGG-8/C5-AGG-1/C6-AGG-1/C7-AGG-3 where utility functions were progressively extracted to `contest-status-styles.ts`. The label map should follow the same pattern.

Additionally, `ContestStatus` (in `contests.ts`) and `ContestStatusKey` (in `contest-status-styles.ts`) are identical union types with different names (see C8-AGG-6).

**Fix:** Extract `buildContestStatusLabels(t: (key: string) => string): Record<ContestStatusKey, string>` to `contest-status-styles.ts`, similar to `buildStatusLabels` for submission statuses. Update all 3 files to import from the shared module.

---

### C8-AGG-4: [LOW] `bg-green-500` badge on user detail page missing dark mode and `text-white`

**Sources:** C8-CR-4 | **Confidence:** HIGH

`src/app/(dashboard)/dashboard/admin/users/[id]/page.tsx:119` uses `<Badge className="bg-green-500">` without `text-white` or dark mode variants. Every other colored badge in the codebase uses the pattern `bg-{color}-500 text-white dark:bg-{color}-600 dark:text-white`.

**Fix:** Change to `bg-green-500 text-white dark:bg-green-600 dark:text-white`.

---

### C8-AGG-5: [LOW] Misplaced JSDoc comment in `contest-status-styles.ts`

**Sources:** C8-CR-5 | **Confidence:** HIGH

`src/app/(public)/_components/contest-status-styles.ts:15-21` has two consecutive JSDoc comments where the first (for `getContestStatusBorderClass`) is misplaced above `getContestStatusBadgeVariant` instead of above its own function (line 39).

**Fix:** Move the border class JSDoc to directly precede `getContestStatusBorderClass`.

---

### C8-AGG-6: [LOW] `ContestStatus` and `ContestStatusKey` are identical union types

**Sources:** C8-CR-6 | **Confidence:** HIGH

Two identical union types exist for the same concept:
- `src/lib/assignments/contests.ts:24-29` — `type ContestStatus = "upcoming" | "open" | "in_progress" | "expired" | "closed"`
- `src/app/(public)/_components/contest-status-styles.ts:8-13` — `type ContestStatusKey = "upcoming" | "open" | "in_progress" | "expired" | "closed"`

**Fix:** Re-export `ContestStatus` from `contest-status-styles.ts` or create a shared canonical type.

---

### C8-AGG-7: [LOW] Progress bar colors in language config table missing dark mode variants

**Sources:** C8-CR-7 | **Confidence:** LOW

`src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:338` uses `bg-red-500`/`bg-yellow-500`/`bg-green-500` without dark mode variants for a progress bar.

**Fix:** Add `dark:bg-red-600`, `dark:bg-yellow-600`, `dark:bg-green-600` variants.

---

## Carried Deferred Items (unchanged from cycle 7)

- DEFER-22: `.json()` before `response.ok` — 60+ instances
- DEFER-23: Raw API error strings without translation — partially fixed
- DEFER-24: `migrate/import` unsafe casts — partially addressed by C2-AGG-4
- DEFER-27: Missing AbortController on polling fetches
- DEFER-28: `as { error?: string }` pattern — 22+ instances
- DEFER-29: Admin routes bypass `createApiHandler`
- DEFER-30: Recruiting validate token brute-force
- DEFER-32: Admin settings exposes DB host/port
- DEFER-33: Missing error boundaries
- DEFER-34: Hardcoded English fallback strings
- DEFER-35: Hardcoded English strings in editor title attributes
- DEFER-36: `formData.get()` cast assertions
- DEFER-43: Docker client leaks `err.message` in build responses
- DEFER-44: No documentation for timer pattern convention
- C2-AGG-9/C3-AGG-5/C4-AGG-4: `getDbNow` called redundantly — LOW, deferred
- C2-AGG-10: CountdownTimer namespace mismatch — LOW, deferred

---

## No Agent Failures

The review lane completed successfully.

---

## Gate Status

- **eslint:** PASSED (0 errors, 0 warnings)
- **tsc --noEmit:** PASSED (0 errors)
- **next build:** Not yet run this cycle

---

## Plannable Tasks for This Cycle

1. **C8-AGG-1** (MEDIUM) — Pass locale to `formatBytes` in create-problem-form and compiler-client
2. **C8-AGG-2** (MEDIUM) — Pass locale to `formatNumber` in system-info.ts or document the decision
3. **C8-AGG-3** (MEDIUM) — Extract contest status label map to shared utility in contest-status-styles.ts
4. **C8-AGG-4** (LOW) — Add dark mode and text-white to active badge on user detail page
5. **C8-AGG-5** (LOW) — Fix misplaced JSDoc in contest-status-styles.ts
6. **C8-AGG-6** (LOW) — Unify ContestStatus and ContestStatusKey types
7. **C8-AGG-7** (LOW) — Add dark mode variants to language config table progress bar
