# RPF Cycle 20 — Verifier

**Date:** 2026-04-22
**Base commit:** 4182e529

## Findings

### V-1: `create-group-dialog.tsx:74` — Unguarded `.json()` violates codebase's own documented convention [MEDIUM/HIGH]

**File:** `src/app/(dashboard)/dashboard/groups/create-group-dialog.tsx:74`

**Description:** The codebase's `src/lib/api/client.ts:25-48` explicitly documents: "CRITICAL: Always check `response.ok` before calling `response.json()`. Calling `.json()` on a non-JSON body (e.g., 502 HTML from a reverse proxy) throws a SyntaxError that bypasses error-handling logic." Line 74 calls `.json()` after checking `response.ok` but without `.catch()`, violating the documented convention for success paths.

**Verification:** Confirmed the `SyntaxError` crash scenario. If the server returns 200 with HTML, `.json()` throws, the outer catch shows a generic error toast, and `data.data.id` is never accessed. The group may have been created but the user cannot navigate to it.

**Fix:** Add `.catch(() => ({ data: {} }))` and guard `data.data?.id` before navigation.

---

### V-2: `admin-config.tsx:103` — Test connection `.json()` unguarded on success path [MEDIUM/MEDIUM]

**File:** `src/lib/plugins/chat-widget/admin-config.tsx:103`

**Description:** Same convention violation as V-1. The `handleTestConnection` function calls `.json()` without `.catch()` after `response.ok`.

**Verification:** Confirmed. A non-JSON 200 response from the test-connection endpoint would cause SyntaxError, caught by the outer catch, showing a misleading "error" test result.

**Fix:** Add `.catch()` or use `apiFetchJson`.

---

### V-3: `comment-section.tsx:45` — GET fetch `.json()` unguarded on success path [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx:45`

**Description:** The `fetchComments` function calls `(await response.json())` after `if (response.ok)` without `.catch()`.

**Verification:** Confirmed. A non-JSON 200 response would throw SyntaxError, resulting in a "loadError" toast for a parse failure rather than a server error.

**Fix:** Add `.catch(() => ({ data: [] }))`.

---

### V-4: `providers.ts:138,258,398` — AI provider `.json()` unguarded on success paths [MEDIUM/MEDIUM]

**Files:** `src/lib/plugins/chat-widget/providers.ts:138,258,398`

**Description:** All three AI provider `chatWithTools` implementations call `.json()` without `.catch()` after checking `response.ok`.

**Verification:** Confirmed. While these are server-to-server calls, CDN/WAF intermediaries can inject HTML responses.

**Fix:** Wrap in `.catch(() => ({}))`.

---

### V-5: `admin-config.tsx:294,305` — `Number()` can produce NaN for empty inputs [LOW/MEDIUM]

**File:** `src/lib/plugins/chat-widget/admin-config.tsx:294,305`

**Description:** `Number("")` returns `0`, not NaN, so clearing the field results in `maxTokens: 0` or `rateLimitPerMinute: 0`, which are likely invalid values for the AI provider API.

**Verification:** Confirmed. `Number("")` === `0` in JavaScript. An admin clearing the maxTokens field would send `maxTokens: 0` to the server.

**Fix:** Use `parseInt(e.target.value, 10) || 100` and `parseInt(e.target.value, 10) || 10`.

---

## Verified Safe (Confirmed Working)

- `contest-join-client.tsx` — Guard against undefined `assignmentId` after JSON parse failure confirmed working (line 51-54)
- `bulk-create-dialog.tsx` — `.catch()` on both error and success `.json()` confirmed (lines 213, 219)
- `assignment-form-dialog.tsx` — `parseFloat()` for points field confirmed (line 651)
- `forceNavigate` JSDoc documentation confirmed (lines 4-8)
- All discussion components properly use `.json().catch(() => ({}))` pattern
- No raw server error strings leaked to users (comment-section, bulk-create-dialog both use console.error + localized toast)
