# Verifier Review — RPF Cycle 25

**Date:** 2026-04-22
**Base commit:** ac51baaa

## V-1: Verify `handleBulkAddMembers` double `.json()` fix -- CONFIRMED FIXED

**File:** `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:181`

Verified: The function now parses body once before branching:
```ts
const payload = await response.json().catch(() => ({ enrolled: 0, skipped: 0 }))
if (!response.ok) { throw new Error(payload.error || "bulkAddFailed"); }
```
Correctly implemented. No double `.json()` call.

---

## V-2: Verify discussion components raw error.message fix -- CONFIRMED FIXED

**Files:**
- `src/components/discussions/discussion-post-form.tsx`
- `src/components/discussions/discussion-thread-form.tsx`
- `src/components/discussions/discussion-post-delete-button.tsx`
- `src/components/discussions/discussion-thread-moderation-controls.tsx`

All four now use `toast.error(errorLabel)` in their catch blocks with `console.error()` for logging. Verified correct.

---

## V-3: Verify `submission-overview.tsx` silent error swallowing fix -- CONFIRMED FIXED

**File:** `src/components/lecture/submission-overview.tsx:92`

Now shows `toast.error(t("fetchError"))` on initial load when `!res.ok`. Verified correct.

---

## V-4: Verify `problem-submission-form.tsx` double `.json()` fix -- CONFIRMED FIXED

**File:** `src/components/problem/problem-submission-form.tsx:184,247`

Both `handleRun` and `handleSubmit` now parse body once before branching. Verified correct.

---

## V-5: Verify `compiler-client.tsx` double `.json()` fix -- CONFIRMED FIXED

**File:** `src/components/code/compiler-client.tsx:268`

Now parses body once before branching. Verified correct.

---

## V-6: `create-problem-form.tsx` default error handler still leaks raw error.message -- NEW FINDING [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:310`

```ts
default:
  return error.message || tCommon("error");
```

This was NOT addressed in previous cycles. The `getErrorMessage` function's default case returns `error.message` for any unmapped error type, potentially exposing raw error text to users.

**Fix:** Change default to `return tCommon("error")` and add `console.error("Unmapped error:", error)`.

---

## V-7: `assignment-form-dialog.tsx` default error handler still leaks raw error.message -- NEW FINDING [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:206`

Same issue as V-6. The default case returns `error.message || tCommon("error")`.

**Fix:** Same as V-6.

---

## V-8: `edit-group-dialog.tsx` SyntaxError check is dead code -- NEW FINDING [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/groups/edit-group-dialog.tsx:66-69`

```ts
default:
  if (error instanceof SyntaxError) {
    return tCommon("error");
  }
  return tCommon("error");
```

Both branches return the same value. The `SyntaxError` check was presumably meant to filter out SyntaxError from the `error.message` fallback, but since both paths return the i18n key, the check is dead code.

**Fix:** Remove the dead SyntaxError check. Simplify to `default: console.error("Unmapped error:", error); return tCommon("error")`.
