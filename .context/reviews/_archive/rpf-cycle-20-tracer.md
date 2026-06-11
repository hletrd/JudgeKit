# RPF Cycle 20 — Tracer

**Date:** 2026-04-22
**Base commit:** 4182e529

## Traced Flows

### TR-1: Group creation — `.json()` crash chain

**Flow:** `create-group-dialog.tsx` -> `apiFetch("/api/v1/groups")` -> `response.ok` check -> `response.json()` -> `data.data.id` -> `router.push()`

**Hypothesis 1 (confirmed):** If `.json()` throws SyntaxError on a non-JSON 200 response, the catch block shows "createError" toast but the group was actually created. User cannot navigate to the new group.

**Hypothesis 2 (confirmed):** If `.json()` succeeds but `data.data.id` is undefined (malformed response), `router.push("/dashboard/groups/undefined")` would navigate to a 404 page.

**Competing hypotheses resolved:** Hypothesis 1 is more likely in production (CDN/proxy HTML injection). Hypothesis 2 is a secondary risk if the server response schema changes.

**Fix:** Add `.catch()` to `.json()` and guard `data.data?.id` before navigation.

---

### TR-2: Test connection — `.json()` crash chain

**Flow:** `admin-config.tsx:handleTestConnection()` -> `apiFetch("/api/v1/plugins/chat-widget/test-connection")` -> `response.ok` -> `response.json()` -> `setTestResult(data)`

**Hypothesis (confirmed):** If `.json()` throws SyntaxError, the catch block sets `{ success: false, error: tCommon("error") }`. This is misleading — the test may have succeeded but the response was unparseable.

**Fix:** Add `.catch()` or use `apiFetchJson`.

---

### TR-3: Comment fetch — `.json()` crash chain

**Flow:** `comment-section.tsx:fetchComments()` -> `apiFetch("/api/v1/submissions/${submissionId}/comments")` -> `if (response.ok)` -> `response.json()` -> `setComments(payload.data)`

**Hypothesis (confirmed):** If `.json()` throws SyntaxError, the catch block shows "loadError" toast. This is a false-positive error notification. The comments may have been retrieved but the response was unparseable.

**Fix:** Add `.catch(() => ({ data: [] }))`.

---

### TR-4: Admin config `Number()` NaN propagation

**Flow:** `admin-config.tsx:maxTokens input` -> `Number(e.target.value)` -> `setMaxTokens(NaN)` -> `handleSubmit` -> `onSave({ maxTokens: NaN })` -> server API

**Hypothesis (partially confirmed):** `Number("")` returns `0`, not NaN, so clearing the field sends `maxTokens: 0`. This is likely rejected by the AI provider API but is not a NaN issue. However, `Number("abc")` returns `NaN`, which would propagate to the server.

**Fix:** Use `parseInt` with fallback to a sensible default.
