# RPF Cycle 20 — Test Engineer

**Date:** 2026-04-22
**Base commit:** 4182e529

## Findings

### TE-1: No unit tests for `create-group-dialog.tsx` `.json()` error handling [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/groups/create-group-dialog.tsx`

**Description:** The create-group dialog has no component tests. Specifically, the unguarded `.json()` on line 74 and the `data.data.id` navigation on line 78 have no test coverage. A test should verify: (a) SyntaxError from non-JSON response shows error toast, (b) missing `data.data.id` doesn't navigate to undefined, (c) successful creation navigates to the correct URL.

**Fix:** Add component test covering success and error paths.

---

### TE-2: No unit tests for `admin-config.tsx` test-connection flow [LOW/MEDIUM]

**File:** `src/lib/plugins/chat-widget/admin-config.tsx`

**Description:** The chat widget admin config has no component tests. The `handleTestConnection` function's `.json()` without `.catch()` and the `Number()` NaN risk for maxTokens/rateLimitPerMinute are untested.

**Fix:** Add component test for test-connection success/failure and config field validation.

---

### TE-3: No unit tests for `comment-section.tsx` GET fetch path [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx`

**Description:** The comment section's `fetchComments` function is called on mount but has no dedicated component test for the GET `.json()` path. The error handling for non-JSON responses is untested.

**Fix:** Add component test covering fetch success and non-JSON parse failure.

---

### TE-4: No unit tests for AI provider `chatWithTools` error handling [LOW/MEDIUM]

**File:** `src/lib/plugins/chat-widget/providers.ts`

**Description:** The provider module has no unit tests for the `chatWithTools` implementations. The unguarded `.json()` calls at lines 138, 258, 398 are untested for non-JSON response scenarios.

**Fix:** Add unit tests for each provider's error handling paths.

---

## Previously Carried Test Gaps

- TE-1 (cycle 19): `apiFetchJson` helper untested — carried as DEFER-56
- TE-2 (cycle 19): Encryption module untested — carried as DEFER-50
- TE-3 (cycle 19): No component tests for `quick-create-contest-form.tsx` — carried
- TE-4 (cycle 19): No component tests for `api-keys-client.tsx` — carried
