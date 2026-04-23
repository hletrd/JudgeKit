# Document Specialist — RPF Cycle 6

## Scope
Documentation-code alignment check for recently changed files.

## Findings

### DOC-1: `apiFetch` JSDoc documents error-first antipattern but `countdown-timer.tsx` uses `.json()` without `.catch()`
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/components/exam/countdown-timer.tsx:80`
- **Problem:** The `apiFetch` JSDoc (added in cycle 5 TASK-8) clearly states that `.json()` should always be guarded with `.catch(() => ({}))` on error paths. The countdown timer's `/api/v1/time` fetch calls `res.json()` without `.catch()` after checking `res.ok`. While the outer `.catch(() => {})` prevents crashes, it silently swallows errors instead of following the documented pattern.
- **Fix:** Add `.catch(() => null)` and handle null in the next `.then`.

### DOC-2: `problem-set-form.tsx` — JSDoc or inline comments missing for complex error discrimination logic
- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/app/(dashboard)/dashboard/problem-sets/_components/problem-set-form.tsx:226-238`
- **Problem:** The error handling in `handleSubmit` has a list of specific error codes that map to i18n keys. This list is hardcoded and not documented. If a new validation error is added to the API, the form silently falls through to a generic error message.
- **Fix:** Add a comment explaining that this list must stay in sync with server-side validation errors. Low priority.

### DOC-3: `public-nav.ts` — `getDropdownItems` JSDoc says "when capabilities are absent, only items that require no specific capability are shown"
- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/lib/navigation/public-nav.ts:82-84`
- **Problem:** The code does `return capsSet?.has(item.capability) ?? false` — when `capsSet` is null (no capabilities), items with a capability return `false`. Items without a capability return `true` (line 83). This is correct and matches the JSDoc. No issue found.
