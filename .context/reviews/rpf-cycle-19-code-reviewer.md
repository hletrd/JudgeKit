# Code Review — RPF Cycle 19

**Date:** 2026-04-20
**Reviewer:** code-reviewer
**Base commit:** 77da885d

## Findings

### CR-1: Duplicate `formatNumber` implementation — `dashboard-judge-system-section.tsx` defines its own instead of using shared utility [MEDIUM/MEDIUM]

**Files:** `src/app/(dashboard)/dashboard/_components/dashboard-judge-system-section.tsx:5-7`
**Description:** A local `formatNumber` function is defined at the top of this file using `new Intl.NumberFormat(locale).format(value)`, while a shared `formatNumber` utility was added to `src/lib/datetime.ts` in a recent commit (131dc046). The local version is functionally identical but creates a maintenance hazard — bug fixes or locale-handling improvements to the shared utility will not propagate here.
**Concrete failure scenario:** A fix to the shared `formatNumber` (e.g., handling `NaN` or `Infinity`) is applied to `datetime.ts` but the local copy is not updated, leading to inconsistent behavior.
**Fix:** Remove the local `formatNumber` and import from `@/lib/datetime`.

### CR-2: Duplicate `formatBytes`/`formatFileSize` functions in admin pages — no shared utility [LOW/MEDIUM]

**Files:** `src/app/(dashboard)/dashboard/admin/files/page.tsx:50-54`, `src/app/(dashboard)/dashboard/admin/settings/database-info.tsx:13-18`
**Description:** Two nearly identical byte-formatting functions exist in separate admin pages. `formatFileSize` handles B/KB/MB; `formatBytes` handles B/KB/MB/GB. They use `.toFixed()` which is locale-unaware. If a non-Latin-numeric locale is added, these would produce incorrect digit grouping.
**Concrete failure scenario:** A Hindi or Arabic locale user sees `1,024.0 KB` instead of the correctly grouped digits for their locale.
**Fix:** Extract a shared `formatBytes(value, locale)` utility (in `@/lib/formatting` or `@/lib/datetime`) that uses `formatNumber` for locale-aware digit grouping.

### CR-3: `.toFixed()` used for user-facing numbers in 15+ locations — inconsistent with `formatNumber` migration [LOW/LOW]

**Files:** `src/app/(public)/users/[id]/page.tsx:82`, `src/app/(public)/_components/public-problem-list.tsx:164`, `src/app/(public)/practice/problems/[id]/page.tsx:174`, `src/app/(public)/languages/page.tsx:90`, and ~11 more locations in dashboard pages
**Description:** The codebase recently added `formatNumber` in `@/lib/datetime` to replace hardcoded `toLocaleString("en-US")`. However, `.toFixed()` calls for user-facing numbers (success rates, difficulty scores, file sizes, accuracy percentages) still produce locale-unaware output. While `.toFixed()` is acceptable for internal/admin-only displays where locale consistency is less critical, the public-facing pages should use locale-aware formatting.
**Fix:** For public-facing numeric displays, replace `.toFixed()` with `formatNumber`. For admin-only displays, this is lower priority but should be aligned eventually.

### CR-4: `api-keys-client.tsx` clipboard fallback missing error feedback [LOW/MEDIUM]

**Files:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:212-228`
**Description:** The `handleCopyKeyPrefix` function has a clipboard fallback using `document.execCommand("copy")` but does not show any error feedback if the fallback also fails. The `copy-code-button.tsx` was recently fixed (commit 337e306e) to show `toast.error(t("copyFailed"))` on fallback failure, but this instance was missed.
**Concrete failure scenario:** On an old browser where both `navigator.clipboard` and `execCommand("copy")` fail, the user gets no feedback that the copy failed.
**Fix:** Add `toast.error(t("copyFailed"))` in the `execCommand` fallback path, matching the pattern in `copy-code-button.tsx`.

### CR-5: Practice page `searchParams` typed as optional but always awaited — confusing type contract [LOW/LOW]

**Files:** `src/app/(public)/practice/page.tsx:120-121`
**Description:** `searchParams` is typed as `Promise<...> | undefined` but the function always does `searchParams ? await searchParams : undefined`. Next.js 15 always provides `searchParams` as a Promise, making the optional typing misleading. The `generateMetadata` function (line 73-74) has the same pattern.
**Fix:** Type `searchParams` as `Promise<...>` without the optional `?`, matching Next.js 15's contract. Remove the conditional await.
