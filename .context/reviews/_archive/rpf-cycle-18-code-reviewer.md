# Code Reviewer — RPF Cycle 18

**Date:** 2026-04-20
**Base commit:** 2b415a81

## CR-1: `formatNumber` in submission-status-badge uses hardcoded "en-US" locale [MEDIUM/MEDIUM]

**File:** `src/components/submission-status-badge.tsx:45`
**Description:** `n.toLocaleString("en-US")` hardcodes the locale to "en-US" for formatting execution time and memory numbers. The app supports Korean and English locales via next-intl, and all other datetime formatting uses locale-aware utilities from `@/lib/datetime`.
**Concrete failure scenario:** Korean users see numbers formatted with commas (1,234) which is correct for Korean too, but this is inconsistent with the codebase's locale-aware approach. More critically, if a different locale is added in the future that uses different digit grouping (e.g., Hindi), this would produce wrong formatting.
**Fix:** Pass `locale` as a prop to `SubmissionStatusBadge` and use it in `toLocaleString(locale)`, or create a shared `formatNumber` utility in `@/lib/datetime` that respects locale.

## CR-2: `userId!` non-null assertion in practice page progress filter [LOW/MEDIUM]

**File:** `src/app/(public)/practice/page.tsx:431`
**Description:** `eq(submissions.userId, userId!)` uses a non-null assertion. While the code is inside the `else` branch where `currentProgressFilter !== "all" && userId` is guaranteed (the branch is only entered when `userId` is truthy), TypeScript cannot infer this because the check was done in the `if` condition on a different line. A safer pattern would be to capture `const uid = userId!;` at the top of the else branch with a comment, or restructure the check.
**Concrete failure scenario:** If the control flow is refactored such that `userId` could be null in this branch, the non-null assertion silently passes and produces a SQL query with null userId instead of a compile-time error.
**Fix:** Add `const uid = userId!; /* guaranteed by currentProgressFilter check */` at the start of the else block and use `uid` in the query.

## CR-3: `document.execCommand("copy")` is deprecated [LOW/LOW]

**Files:** `src/components/code/copy-code-button.tsx:28`, `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:224`
**Description:** Both components use `document.execCommand("copy")` as a fallback when `navigator.clipboard.writeText()` fails. `execCommand` is deprecated and may be removed from browsers. However, both already handle the primary case with the Clipboard API, and `execCommand` is only a fallback.
**Concrete failure scenario:** If a browser removes `execCommand`, the fallback fails silently after the Clipboard API already failed. The user sees no feedback about the copy failure.
**Fix:** Add a toast error notification in the `execCommand` fallback's catch path (api-keys-client already shows a toast for the primary failure, but copy-code-button does not). For api-keys-client, also add clipboard error feedback via i18n key instead of the hardcoded English string.

## CR-4: Hardcoded English error string in api-keys clipboard fallback [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:201`
**Description:** `toast.error("Failed to copy — please select and copy manually")` is a hardcoded English string. The rest of the component uses `t()` for all other user-facing strings.
**Concrete failure scenario:** Korean users see an English error toast when the clipboard write fails.
**Fix:** Add a `copyFailed` i18n key to `messages/en.json` and `messages/ko.json` for the admin.apiKeys namespace and use `t("copyFailed")` instead.

## CR-5: Practice page success-rate sort fetches all problem data then re-fetches for tags [LOW/LOW]

**File:** `src/app/(public)/practice/page.tsx:270-290`
**Description:** When sorting by success rate (`successRate_desc`), the code first queries with a left join for stats (line 246-268), then re-queries the same problems with `db.query.problems.findMany()` just to get `problemTags` with nested tag data (line 271-289). This results in two DB roundtrips for the same page of problems.
**Concrete failure scenario:** Minor latency increase on practice page loads when sorting by success rate.
**Fix:** Add the `problemTags` relation to the initial stats query or restructure the left join to include tags in a single query.

## Verified Safe

- No `as any` type casts found in the codebase.
- No `@ts-ignore` or `@ts-expect-error` found.
- Only 2 `eslint-disable` directives, both with justification comments.
- No silently swallowed catch blocks (all empty catches have legitimate reasons: clipboard failures, localStorage unavailability, form submission race conditions).
- `dangerouslySetInnerHTML` is used only in two places: JSON-LD with `safeJsonForScript()` sanitization, and legacy HTML problem descriptions with DOMPurify sanitization — both are safe.
- Korean letter-spacing handling is comprehensive and correct — all `tracking-tight`/`tracking-wide` uses are properly conditional on locale.
