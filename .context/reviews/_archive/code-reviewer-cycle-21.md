# Code Review — Cycle 21

**Date:** 2026-05-09
**HEAD:** 17ae0bda
**Agent:** code-reviewer (manual)

---

## C21-1: [MEDIUM] Import timestamp column detection uses wrong Drizzle dataType string

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/lib/db/import.ts:33`
- **Category:** data_integrity
- **Summary:** `buildImportColumnSets` checks `dataType === "date"` to detect timestamp columns, but the PostgreSQL schema defines timestamp columns using Drizzle's `timestamp()` builder, which reports `dataType === "timestamp"`. There are zero `date()` columns in the entire schema. Consequently, `TIMESTAMP_COLUMNS` is always empty, and the `convertValue` function never converts ISO string timestamps back to `Date` objects during import. Drizzle may reject string values for timestamp columns, or PostgreSQL may accept them with unexpected timezone behavior, corrupting temporal data during restore operations.
- **Concrete failure:** An operator exports the database, then attempts to import it. All `created_at`, `updated_at`, `submitted_at`, etc. values remain as ISO strings instead of `Date` objects. Depending on the PostgreSQL driver version, this may cause type errors during batch insert or silently store strings in timestamp-with-timezone columns, breaking temporal queries and comparisons.
- **Fix:** Change `dataType === "date"` to `dataType === "timestamp"` in `buildImportColumnSets`.

## C21-2: [MEDIUM] Unvalidated plugin config cast in auto-review background job

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/lib/judge/auto-review.ts:92`
- **Category:** input_validation
- **Summary:** `auto-review.ts` casts `pluginState.config` to a fully-typed object without runtime validation. Cycle 20 fixed the same pattern in `chat/route.ts` (C20-5 / S20-2) by adding a zod schema, but `auto-review.ts` was missed. If the plugin config stored in the DB is corrupted or partially migrated, fields like `provider` could be undefined, causing the `switch` to fall through to the default case and potentially passing an undefined `apiKey` to the provider — which is caught by the `if (!apiKey) return` guard, but represents a defense-in-depth gap.
- **Concrete failure:** A schema migration partially corrupts the chat-widget config JSONB. The next accepted submission triggers `triggerAutoCodeReview`, which casts the corrupted config. `config.provider` is undefined, so the switch falls to default (OpenAI). `config.openaiApiKey` is also undefined, so the guard catches it and silently skips the review. The user never sees an AI review, and the only signal is a debug log.
- **Fix:** Share the `pluginConfigSchema` from `chat/route.ts` (or extract it to a shared module) and validate `pluginState.config` before use in `auto-review.ts`.

## C21-3: [LOW] use-mobile hook uses inconsistent width-detection methods

- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/hooks/use-mobile.ts:9-15`
- **Category:** ux_reliability
- **Summary:** The hook initializes `isMobile` using `window.innerWidth < MOBILE_BREAKPOINT` but listens to a media query for changes. These two methods can disagree in edge cases (browser zoom, pixel density variations, or when the media query uses different logic than `innerWidth`). The more robust pattern is to use `mql.matches` consistently.
- **Fix:** Use `mql.matches` for the initial state instead of `window.innerWidth`.

## C21-4: [LOW] use-keyboard-shortcuts blocks ALL modifier-key combinations

- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/hooks/use-keyboard-shortcuts.ts:30`
- **Category:** ux_reliability
- **Summary:** The `handleKeyDown` handler returns early if ANY modifier key is pressed (`ctrlKey`, `metaKey`, or `altKey`). The comment says "Ignore when modifier keys are pressed (except for our own shortcuts)", but the code has no exception — it unconditionally blocks all shortcuts when modifiers are held. This means shortcuts like "Ctrl+S" or "Cmd+Enter" can never be registered through this hook, even though callers might expect them to work.
- **Fix:** Remove the blanket modifier check, or change the API to allow callers to specify modifier combinations explicitly.

---

## Deferred / No Findings

- No new SQL injection risks (all queries use Drizzle parameterized queries).
- No new race conditions in SSE connection tracking beyond those already documented.
- The `apiFetchJson` `as T` cast is a known architectural pattern documented in the file; callers are expected to validate at the call site.
- The `db/export-with-files.ts` reader lock release in the success path is handled automatically by the stream reaching `done`.
- All prior cycle fixes (RAF cleanup, timer leaks, AbortController separation, stable React keys, zod error mapping) remain resolved.
