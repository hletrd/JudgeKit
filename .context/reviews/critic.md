# Critic Review — RPF Cycle 25

**Date:** 2026-04-22
**Base commit:** ac51baaa

## CRI-1: Default error handlers leaking raw `error.message` -- systemic pattern [MEDIUM/HIGH]

Multiple components have `default: return error.message || tCommon("error")` in their `getErrorMessage` switch/case. This is a systemic pattern that needs a unified fix:

- `src/app/(dashboard)/dashboard/groups/edit-group-dialog.tsx:66-69` -- has `SyntaxError` check but then also returns `tCommon("error")` in the same block, making the SyntaxError check dead code
- `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:206`
- `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:310`
- `src/app/(dashboard)/dashboard/groups/create-group-dialog.tsx:33`

The `edit-group-dialog.tsx` case is particularly odd:
```ts
default:
  if (error instanceof SyntaxError) {
    return tCommon("error");
  }
  return tCommon("error");
```
Both branches return the same value, making the `SyntaxError` check dead code.

**Fix:** Unify all default cases to `return tCommon("error")` with `console.error()`. Remove the dead SyntaxError check in edit-group-dialog.

---

## CRI-2: `compiler-client.tsx` error messages flow is inconsistent -- some use i18n, some use raw strings [MEDIUM/MEDIUM]

**File:** `src/components/code/compiler-client.tsx:271-279, 292-299`

In the `!res.ok` branch, raw `data.error`/`data.message`/`res.statusText` are shown in both the inline error display and the toast description. In the catch branch, `err.message` or `"Network error"` is shown. Neither uses i18n for the actual error content.

Meanwhile, the `problem-submission-form.tsx` properly uses `translateSubmissionError` to map errors to i18n keys. The inconsistency suggests the compiler client was not updated to follow the same convention.

**Fix:** Add i18n keys for compiler error types and use them in toasts. The inline error display can keep raw messages for debugging purposes.

---

## CRI-3: `contest-quick-stats.tsx` uses non-null assertion on potentially undefined data [LOW/LOW]

**File:** `src/components/contest/contest-quick-stats.tsx:65-68`

```ts
Number(data.data!.participantCount)
```

The `!` non-null assertion is used inside a conditional that checks `ok && data.data && typeof data.data === "object"`. While this is technically safe due to the guard, the double-wrapping of `Number()` on already-numeric values is the real issue. Using `data.data!.participantCount` directly after the type guard would be cleaner and avoid unnecessary coercion.

**Fix:** Remove `Number()` wrapping and use direct property access after the type guard.

---

## CRI-4: `contest-replay.tsx` speed selector uses `Number(v)` instead of `parseInt(v)` [LOW/LOW]

**File:** `src/components/contest/contest-replay.tsx:185`

```ts
onValueChange={(v) => setSpeed(Number(v) as (typeof PLAYBACK_SPEEDS)[number])}
```

Per the established convention in the codebase (cycle 23/24 fixes), `parseInt()` should be used for numeric input parsing instead of `Number()`. While `Number()` works for this case since the values come from `String(speed)` and are always valid integers, it's inconsistent with the established pattern.

**Fix:** Use `parseInt(v, 10)` for consistency with codebase conventions.
