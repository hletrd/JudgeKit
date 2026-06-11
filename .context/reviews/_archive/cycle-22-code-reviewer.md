# Code Reviewer — Cycle 22 (Fresh)

**Date:** 2026-04-20
**Base commit:** e80d2746

## Findings

### CR-1: Chat widget admin-config.tsx uses raw `fetch()` with manual CSRF header [MEDIUM/HIGH]

**File:** `src/lib/plugins/chat-widget/admin-config.tsx:89-92`
**Description:** The `handleTestConnection` function uses raw `fetch()` with manually set `X-Requested-With: XMLHttpRequest` header instead of the centralized `apiFetch` from `@/lib/api/client`. The same pattern exists in `chat-widget.tsx:154`. The cycle-21 H1 fix migrated 11 similar raw fetch calls in admin components to `apiFetch`, but missed these two in the chat widget plugin because the audit was scoped to `src/app/(dashboard)/dashboard/admin/` and did not include `src/lib/plugins/`.
**Concrete failure scenario:** A CSRF protection change applied to `apiFetch` (e.g., adding a custom token header) would not propagate to these two call sites, creating a CSRF bypass.
**Fix:** Replace raw `fetch()` with `apiFetch()` in both `admin-config.tsx:89` and `chat-widget.tsx:154`, removing the manual `X-Requested-With` header.
**Confidence:** HIGH

### CR-2: `access-code-manager.tsx` `fetchCode` silently swallows non-OK responses [LOW/MEDIUM]

**File:** `src/components/contest/access-code-manager.tsx:38-48`
**Description:** The `fetchCode` callback checks `if (res.ok)` but does nothing on non-OK responses -- no toast, no state update, no retry. When the fetch fails (e.g., 403, 500), the component silently shows no access code with no explanation to the user.
**Concrete failure scenario:** A contest admin opens the access code panel, gets a 500 error, and sees an empty panel with no indication of failure. They may think no code exists yet.
**Fix:** Add an `else` branch that shows a toast error on non-OK responses, matching the pattern used in `handleGenerate` (lines 113-116).
**Confidence:** MEDIUM

### CR-3: `formatNumber` re-export from `datetime.ts` is deprecated but still present [LOW/MEDIUM]

**File:** `src/lib/datetime.ts:61`
**Description:** `formatNumber` was moved to `formatting.ts` and re-exported from `datetime.ts` with a `@deprecated` JSDoc tag. However, several files still import from `datetime.ts` instead of `formatting.ts`. The deprecation should be resolved by updating imports and removing the re-export.
**Fix:** Update all `import { formatNumber } from "@/lib/datetime"` imports to `import { formatNumber } from "@/lib/formatting"`, then remove the re-export.
**Confidence:** HIGH

### CR-4: `toHistoryStateValue` in `use-unsaved-changes-guard.ts` uses unsafe `as` cast [LOW/LOW]

**File:** `src/hooks/use-unsaved-changes-guard.ts:42`
**Description:** `return value as HistoryStateValue;` casts any value to `Record<string, unknown>`. If `value` is a string or number, the spread operator later will silently produce an empty object with no warning.
**Concrete failure scenario:** If `window.history.state` is a string (rare but possible), `toHistoryStateValue` would return the string cast as an object. Subsequent spread operations would silently ignore it, potentially losing the guard index tracking.
**Fix:** Add a runtime check: `if (typeof value !== "object" || value === null) return {};` before the cast.
**Confidence:** LOW

## Verified Safe

- All API route `new Date()` calls have been migrated to `getDbNowUncached()` where temporal consistency matters.
- Schema `.$defaultFn(() => new Date())` is appropriate (Drizzle ORM default, not a comparison source).
- No `as any` type casts found in the codebase.
- Only 2 eslint-disable directives, both with justification comments.
- Korean letter-spacing handling is consistent and correct across all components.
- `formatScore` now uses `formatNumber` internally for locale-aware grouping.
