# Cycle 13 — Review Remediation Plan

**Date:** 2026-05-11
**Based on:** `_aggregate-cycle-13.md` (HEAD `bcef0c13`)
**Status:** In Progress

---

## Findings to Address

### C13-1: `rawQueryOne` generic `as` cast
- **File:** `src/lib/db/queries.ts:38`
- **Severity:** LOW
- **Description:** `rawQueryOne<T>` returns `result.rows[0] as T | undefined`, asserting the row shape without runtime validation.
- **Fix:** Change return type to `unknown | undefined` (or `Record<string, unknown> | undefined`) and let callers validate. Since this is a generic helper, forcing callers to validate is the correct pattern. Alternatively, add runtime validation helper but that requires schema knowledge.
- **Action:** Remove the `as T | undefined` cast and change function signature to return `Record<string, unknown> | undefined` or accept a Zod schema for validation.

### C13-2: `rawQueryAll` generic `as` cast
- **File:** `src/lib/db/queries.ts:51`
- **Severity:** LOW
- **Description:** Same pattern as C13-1: `result.rows as T[]`.
- **Fix:** Same approach — remove generic `as` cast.

### C13-3: Fallback path `as` cast in `getSystemSettings`
- **File:** `src/lib/system-settings.ts:107`
- **Severity:** LOW
- **Description:** The fallback query selects partial columns but casts to full `SystemSettingsRecord`. Was missed by cycle 12 as-cast refactor.
- **Fix:** Return `SystemSettingsRecord | undefined` by constructing a full object with safe defaults for missing fields, or return a partial type and let caller handle missing fields.

---

## Implementation Notes

1. For C13-1 and C13-2, the callers of `rawQueryOne` and `rawQueryAll` need to be checked:
   - `rawQueryOne<ClaimedSubmissionRow>` in `judge/claim/route.ts:254` — already validates with Zod schema parse at line 264, so changing return type to `unknown` is safe.
   - Search for other callers and ensure they handle the change.

2. For C13-3, the fallback path is specifically for when the DB migration hasn't run yet. The safest fix is to construct a `SystemSettingsRecord` by spreading the partial result with explicit undefined/null for missing fields.

---

## Deferred Items

No new deferred items. All cycle-12 deferred items remain in `_aggregate-cycle-12.md`.
