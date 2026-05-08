# Code Reviewer — Cycle 8

**Date:** 2026-04-28
**Reviewer:** code-reviewer
**Scope:** Full repository deep review with focus on verifying cycles 1-7 fixes and finding new issues

---

## Cycle 1-7 Fix Verification Summary

All 29 tasks from cycles 1-7 verified. Key verifications:

| Cycle | Task | Description | Status |
|-------|------|-------------|--------|
| C7 | A | formatDifficulty locale in dashboard problems | VERIFIED |
| C7 | B | Contest status badge in enrolled contest detail view | VERIFIED |
| C7 | C | Extract inline badge class strings to shared utility | VERIFIED |

All previous cycle fixes remain intact. No regressions detected.

---

## New Findings (sorted by severity)

### C8-CR-1: [MEDIUM] `formatBytes` called without locale in 3 client component locations

**File + Line:**
- `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:893` — `formatBytes(testCase.input.length)`
- `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:934` — `formatBytes(testCase.expectedOutput.length)`
- `src/components/code/compiler-client.tsx:115` — `formatBytes(content.length)`

**Confidence:** HIGH

**Problem:** `formatBytes` uses `formatNumber` internally, which defaults to `en-US` when no locale is provided. Every other `formatBytes` call site passes locale (e.g., `admin/files/page.tsx:119`, `admin/settings/database-info.tsx:21`). These 3 client-side call sites omit the locale argument, meaning byte sizes will always use `en-US` grouping regardless of the user's locale.

Neither `create-problem-form.tsx` nor `compiler-client.tsx` currently imports `useLocale`. Both are `"use client"` components that could import `useLocale` from `next-intl`.

**Fix:** Import `useLocale` in both components and pass locale to `formatBytes`. Example:
```tsx
const locale = useLocale();
formatBytes(testCase.input.length, locale)
```

**Failure scenario:** A Korean user sees byte sizes with US-style grouping (e.g., "1,234 B") instead of Korean grouping, inconsistent with other number displays on the same page.

---

### C8-CR-2: [MEDIUM] `formatNumber` called without locale in `system-info.ts`

**File + Line:** `src/lib/system-info.ts:63` — `formatNumber(speedMHz / 1000, { maximumFractionDigits: 1 })`

**Confidence:** MEDIUM

**Problem:** `formatNumber` is called with options object but without `locale` key, defaulting to `en-US`. This is a server-side utility that generates CPU frequency labels used by admin dashboard pages that do have locale available. The function `formatFrequency` -> `formatCpuLabel` -> `detectRuntimeSystemInfo` -> `getRuntimeSystemInfo` is called by admin dashboard pages.

However, since `system-info.ts` is a low-level server utility that does system introspection, and the CPU frequency is typically shown in a technical context where `en-US` formatting is acceptable, the severity is moderate.

**Fix:** Either pass locale through the call chain, or accept this as a deliberate `en-US` default for technical data (add a comment documenting the decision).

---

### C8-CR-3: [MEDIUM] Contest status labels duplicated across 3 files instead of shared utility

**Files:**
- `src/app/(public)/contests/page.tsx:57-62` — local `statusLabels` with `upcoming|open|in_progress|expired|closed` keys
- `src/app/(public)/contests/[id]/page.tsx:107-113` — identical local `statusLabels`
- `src/app/(dashboard)/dashboard/contests/page.tsx:91-97` — local `statusLabelMap` with same keys

**Confidence:** HIGH

**Problem:** The contest status label map (`upcoming -> t("contests.status.upcoming")`, etc.) is defined locally in 3 separate files. This is the same class of duplication as C2-AGG-8/C5-AGG-1/C6-AGG-1/C7-AGG-3, which were progressively extracted to shared utilities. If a new contest status is added, all 3 files must be updated independently. The `ContestStatusKey` type and `getContestStatusBadgeVariant`/`getContestStatusBorderClass` utilities already live in `contest-status-styles.ts` — the label map should also live there.

Note: The `ContestStatus` type in `src/lib/assignments/contests.ts` and `ContestStatusKey` type in `contest-status-styles.ts` are identical union types with different names, which is also a type duplication (see C8-CR-6).

**Fix:** Extract a `buildContestStatusLabels(t: (key: string) => string): Record<ContestStatusKey, string>` function to `contest-status-styles.ts` (similar to `buildStatusLabels` for submission statuses in `status-labels.ts`). Update all 3 files to import from the shared module.

---

### C8-CR-4: [LOW] `bg-green-500` badge on user detail page missing dark mode variant and `text-white`

**File + Line:** `src/app/(dashboard)/dashboard/admin/users/[id]/page.tsx:119`
```tsx
<Badge className="bg-green-500">{tCommon("active")}</Badge>
```

**Confidence:** HIGH

**Problem:** This badge uses `bg-green-500` without dark mode variants (`dark:bg-green-600 dark:text-white`) or even light mode `text-white`. The badge's green background with default text color likely has poor contrast in light mode (green on white) and no dark mode styling at all. Every other colored badge in the contest status styles uses the pattern `bg-{color}-500 text-white dark:bg-{color}-600 dark:text-white`.

**Fix:** Change to `bg-green-500 text-white dark:bg-green-600 dark:text-white` to match the convention established by contest status badges.

---

### C8-CR-5: [LOW] Misplaced JSDoc comment in `contest-status-styles.ts`

**File + Line:** `src/app/(public)/_components/contest-status-styles.ts:15-21`

**Problem:** There are two consecutive JSDoc comments — one for `getContestStatusBorderClass` (lines 15-18) and one for `getContestStatusBadgeVariant` (lines 19-21). The first JSDoc was meant for `getContestStatusBorderClass` (which is defined later at line 39) but got displaced when `getContestStatusBadgeVariant` was inserted above it at line 23. The result is that `getContestStatusBorderClass` has no JSDoc and `getContestStatusBadgeVariant` has a misleading one that mentions borders instead of badge variants.

```
/**
 * Returns the CSS class string for a contest card's left border,
 * color-coded by contest status. Includes dark mode variants.
 */
/**
 * Returns the Badge variant for a contest status, color-coded by meaning.
```

**Fix:** Move the border class JSDoc to directly precede `getContestStatusBorderClass` (before line 39). Ensure `getContestStatusBadgeVariant` retains only its own JSDoc.

---

### C8-CR-6: [LOW] `ContestStatus` and `ContestStatusKey` are identical union types with different names

**Files:**
- `src/lib/assignments/contests.ts:24-29` — `type ContestStatus = "upcoming" | "open" | "in_progress" | "expired" | "closed"`
- `src/app/(public)/_components/contest-status-styles.ts:8-13` — `type ContestStatusKey = "upcoming" | "open" | "in_progress" | "expired" | "closed"`

**Confidence:** HIGH

**Problem:** Two identical union types exist for the same concept. If a new status is added to one but not the other, it will cause type errors or silent mismatches. `ContestStatus` is used in server-side logic and `ContestStatusKey` in UI styling code, but they represent the same domain concept.

**Fix:** Re-export `ContestStatus` from `contest-status-styles.ts` (importing from `contests.ts`), or create a shared type that both modules import. This would also help C8-CR-3 since the label map function can use a single canonical type.

---

### C8-CR-7: [LOW] Progress bar colors in language config table missing dark mode variants

**File + Line:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:338`
```tsx
className={`h-full rounded-full ${usagePercent > 90 ? "bg-red-500" : usagePercent > 70 ? "bg-yellow-500" : "bg-green-500"}`}
```

**Confidence:** LOW

**Problem:** The progress bar uses `bg-red-500`, `bg-yellow-500`, `bg-green-500` without dark mode variants. In dark mode, these colors may appear overly bright against a dark background. However, since this is a small decorative progress bar (not a badge with text), the visual impact is lower than the badge case.

**Fix:** Add `dark:bg-red-600`, `dark:bg-yellow-600`, `dark:bg-green-600` variants.

---

## Deferred Items Review

The following deferred items from cycles 1-7 remain unchanged and valid:
- DEFER-22: `.json()` before `response.ok` — 60+ instances, still applicable
- DEFER-27: Missing AbortController on polling fetches — still applicable
- DEFER-28: `as { error?: string }` pattern — still 22+ instances
- DEFER-29: Admin routes bypass `createApiHandler` — still applicable
- DEFER-30: Recruiting validate token brute-force — still applicable
- DEFER-32: Admin settings exposes DB host/port — still applicable
- DEFER-33: Missing error boundaries — some exist (5 error.tsx files in dashboard), but public routes lack them
- DEFER-34/35: Hardcoded English strings — still applicable
- DEFER-36: `formData.get()` cast assertions — still applicable (14+ instances)
