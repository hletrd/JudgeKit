# Code Review — RPF Cycle 3 (2026-05-04)

**Reviewer:** code-reviewer
**HEAD reviewed:** `4cd03c2b`
**Scope:** Full codebase — src/, tests/, deploy scripts. Focus on changes since `988435b5`.

---

## Prior cycle status

- **C1-CR-1 (password.ts policy mismatch):** RESOLVED — `password.ts` now only checks minimum length per AGENTS.md policy.
- **C1-CR-2 (import.ts `any` types):** CARRY — still deferred.
- **C1-CR-3 (latestSubmittedAt mixed-type comparison):** CARRY — still deferred.
- **C1-CR-4 (console.error sites):** CARRY — still deferred.

---

## Findings

### C3-CR-1: [LOW] Hardcoded "Loading..." string in CodeTimelinePanel

- **File:** `src/components/contest/code-timeline-panel.tsx:93`
- **Code:** `if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;`
- **Confidence:** HIGH
- **Problem:** The loading state uses a hardcoded English string instead of the i18n translation key `common.loading` which already exists in `messages/en.json`. The component already imports and uses `useTranslations("common")` as `tCommon` (line 41), so this is an oversight.
- **Fix:** Replace with `{tCommon("loading")}`.

### C3-CR-2: [LOW] Hardcoded "chars" unit string in CodeTimelinePanel

- **File:** `src/components/contest/code-timeline-panel.tsx:199`
- **Code:** `{current.charCount} chars`
- **Confidence:** HIGH
- **Problem:** The character count label is hardcoded in English. Should use an i18n key for consistency with the rest of the internationalized UI.
- **Fix:** Add a translation key like `contests.codeTimeline.charCount` in `messages/en.json` and `messages/ko.json`, then use `t("charCount", { count: current.charCount })`.

### C3-CR-3: [LOW] Hardcoded "Loading..." in dashboard and public loading.tsx files

- **File:** `src/app/(dashboard)/loading.tsx:3,5` and `src/app/(public)/loading.tsx:3,5`
- **Code:** `aria-label="Loading"` and `<span className="sr-only">Loading...</span>`
- **Confidence:** MEDIUM
- **Problem:** These are server components that use hardcoded English strings for `aria-label` and sr-only text. The `common.loading` key exists in the i18n files. Server components can use `getTranslations()` from `next-intl/server`.
- **Fix:** Convert to async server components using `getTranslations("common")` and use `t("loading")` for both the aria-label and sr-only text.

---

## No-issue confirmations

- CSRF validation in recruiting validate endpoint (`src/app/api/v1/recruiting/validate/route.ts`) properly uses `validateCsrf()` and `consumeApiRateLimit()`. Correct.
- ConditionalHeader component (`src/components/layout/conditional-header.tsx`) correctly uses `"use client"` directive and `usePathname()`. The admin detection logic is clean.
- `listModerationDiscussionThreads` in `src/lib/discussions/data.ts` properly pushes scope/state filters to SQL WHERE clause. The "open" state correctly uses `isNull(lockedAt)` to include pinned-but-unlocked threads. Correct.
- Code similarity `performance.now()` migration is correct and well-documented.
- Auth flow, CSRF, encryption, and `createApiHandler` all remain correct.
