# RPF Cycle 28 — Comprehensive Review

**Reviewer:** comprehensive-reviewer
**Date:** 2026-04-23
**Base commit:** ca62a45d
**Scope:** Cross-cutting concerns and systemic patterns across the entire repository

---

## Executive Summary

This review covers five cross-cutting domains: error handling, i18n, security, performance, and type safety. The codebase has a strong foundation — centralized `createApiHandler`, CSRF protection, DOMPurify sanitization, and Zod validation are consistently applied. However, several systemic patterns persist across multiple files that individual reviewers would miss:

1. **`.json()` before `response.ok` check** — 9 remaining instances of a known anti-pattern (prior cycles fixed many, but new instances appeared and some were missed)
2. **Raw API error strings shown to users** — 7 components display untrusted `errorBody.error` directly in toasts without routing through `t()`
3. **Chat widget stale closure** — `sendMessage` captures stale `messages` state; rapid sends cause data loss
4. **Context value instability** — `EditorContentContext` and `LectureModeContext` create new object references every render, cascading re-renders to all consumers
5. **Hardcoded dev encryption key** — Well-known key in source code risks decrypting production data if run in dev mode against prod DB
6. **22 instances of `as { error?: string }`** — Should use shared `ApiErrorResponse` type

---

## SYS-1: `response.json()` before `response.ok` check — systemic anti-pattern [HIGH]

This pattern has been identified and partially fixed in prior cycles, but 9 instances remain. The project's own `src/lib/api/client.ts` documents the correct order: check `ok` first, then parse JSON.

### SYS-1a: `.json()` called BEFORE `res.ok` check (will throw SyntaxError on non-JSON error)

| File | Line | Code |
|------|------|------|
| `contests/join/contest-join-client.tsx` | 44 | `const payload = await res.json(); if (!res.ok) { ... }` |
| `problems/create/create-problem-form.tsx` | 422 | `const data = await res.json(); if (!res.ok) { ... }` |
| `admin/languages/language-config-table.tsx` | 177 | `const data = await res.json().catch(() => ({})); if (res.ok) { ... }` |
| `admin/submissions/admin-submissions-bulk-rejudge.tsx` | 33 | `const payload = await response.json().catch(() => ({})); if (!response.ok) { ... }` |

**Failure scenario:** A reverse proxy (Nginx) returns 502 with HTML body. `.json()` throws `SyntaxError: Unexpected token < in JSON`, which is caught by a generic `catch` that shows "Something went wrong" instead of a useful error.

### SYS-1b: `.json()` on error path without `.catch()` (non-JSON error body crashes)

| File | Line | Code |
|------|------|------|
| `groups/[id]/group-instructors-manager.tsx` | 72 | `if (!res.ok) { const data = await res.json(); toast.error(data.error ?? t("...")); }` |
| `problems/problem-import-button.tsx` | 32 | `if (!res.ok) { const err = await res.json(); toast.error(err.error ?? t("...")); }` |

**Failure scenario:** Same as above — non-JSON error body from proxy causes unhandled `SyntaxError` on the error path.

### SYS-1c: No `response.ok` check at all

| File | Line | Code |
|------|------|------|
| `admin/plugins/chat-logs/chat-logs-client.tsx` | 58 | `const res = await apiFetch(...); const data = await res.json();` |
| `admin/plugins/chat-logs/chat-logs-client.tsx` | 73 | `const res = await apiFetch(...); const data = await res.json();` |

**Failure scenario:** Any non-2xx response silently parsed as JSON, potentially showing garbage data in the admin chat logs UI.

**Fix:** Adopt a project-wide helper `parseApiResponse(res)` that checks `res.ok` first, then parses JSON with `.catch(() => ({}))` on error paths. Replace all manual patterns.

---

## SYS-2: `normalizePage` DoS vector — `Number()` accepts scientific notation [HIGH]

**File:** `src/lib/pagination.ts:6`

`Number("1e7")` = 10,000,000 passes all current guards. This allows extremely large offsets in database queries.

**Failure scenario:** An attacker sends `?page=1e7` to any paginated endpoint. The resulting `OFFSET 10000000` causes a full table scan, consuming database resources and slowing the entire platform.

**Fix:** Use `parseInt(value, 10)` (which rejects scientific notation) and add an upper bound (e.g., max page 10,000).

**Confidence:** High

---

## SYS-3: Missing confirmation dialogs for destructive actions [HIGH]

**File:** `src/components/discussions/discussion-thread-moderation-controls.tsx:92`

Thread deletion has no confirmation dialog, while the less-destructive post deletion uses `DestructiveActionDialog`. The more destructive action (deleting an entire thread with all posts) has less protection than deleting a single post.

**Failure scenario:** An admin accidentally clicks "Delete thread" and immediately destroys an entire discussion thread with no undo.

**Fix:** Wrap thread deletion in `DestructiveActionDialog`, matching the post deletion pattern.

**Confidence:** High

---

## SYS-4: Icon-only buttons lacking `aria-label` — systemic accessibility gap [MEDIUM]

Across multiple components, icon-only buttons use `title` attributes but not `aria-label`. Screen readers cannot identify these buttons because `title` is not reliably announced.

**Affected areas:**
- Recruiting invitations panel
- Lecture toolbar buttons
- Code editor fullscreen toggle
- Contest management actions

**Failure scenario:** A screen-reader user navigates the lecture toolbar and hears only "button" for each action, making it impossible to distinguish between fullscreen, font scale, and stats toggle.

**Fix:** Add `aria-label` to all icon-only `<button>` elements. The `title` attribute can remain as a visual tooltip but must not be the only accessible name.

**Confidence:** High

---

## SYS-5: Hardcoded English strings in compiler client [MEDIUM]

**File:** `src/components/code/compiler-client.tsx:100,106,112`

"Show full output", "(empty)", "... (output truncated)" are hardcoded English while the component uses i18n for other strings.

**Fix:** Replace with i18n keys in `messages/en.json` and `messages/ko.json`.

**Confidence:** High

---

## SYS-6: Silent error swallowing in comment-section GET path [MEDIUM]

**File:** `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx:42-52`

Non-OK responses on GET are silently ignored, violating the project's documented convention.

**Fix:** Add `toast.error()` feedback for non-OK responses.

**Confidence:** High

---

## SYS-7: Raw API error strings shown to users without translation — 7 instances [HIGH]

Seven components display untrusted `errorBody.error` from API responses directly in `toast.error()` without routing through `t()`. If the API returns an English error message, Korean-locale users see raw English.

| File | Line | Pattern |
|------|------|---------|
| `problem/problem-submission-form.tsx` | 185 | `toast.error((errorBody as { error?: string }).error ?? tCommon("error"))` |
| `discussions/discussion-vote-buttons.tsx` | 46 | `toast.error((errorBody as { error?: string }).error ?? voteFailedLabel)` |
| `admin/users/bulk-create-dialog.tsx` | 214 | `toast.error((errorBody as { error?: string }).error ?? tCommon("error"))` |
| `groups/[id]/group-instructors-manager.tsx` | 73 | `toast.error(data.error ?? t("addInstructorFailed"))` |
| `admin/languages/language-config-table.tsx` | 137 | `toast.error(data.error ?? t("toast.buildError"))` |
| `admin/languages/language-config-table.tsx` | 160 | `toast.error(data.error ?? t("toast.removeError"))` |
| `admin/languages/language-config-table.tsx` | 187 | `toast.error(data.error ?? t("toast.pruneError"))` |

**Failure scenario:** API returns `error: "Duplicate entry"` — this English string is shown directly to Korean users. The fallback `t()` key is only used when `error` is undefined.

**Fix:** Change pattern to `toast.error(t(errorBody.error ?? "fallbackKey"))` so the API error code is always treated as an i18n key. The `problem-submission-form.tsx` already has a `translateSubmissionError()` helper that does this — adopt a similar pattern across all components.

**Confidence:** High

---

## SYS-8: Discussion components use `console.error()` with no user feedback — 4 instances [MEDIUM]

Four recently-modified discussion components silently log errors without any user-visible feedback. This directly contradicts the project's documented convention.

| File | Line | Context |
|------|------|---------|
| `discussions/discussion-post-form.tsx` | 47 | POST error logged only to console |
| `discussions/discussion-thread-form.tsx` | 53 | POST error logged only to console |
| `discussions/discussion-post-delete-button.tsx` | 29 | DELETE error logged only to console |
| `discussions/discussion-thread-moderation-controls.tsx` | 51, 71 | DELETE/LOCK error logged only to console |

**Failure scenario:** User clicks "Delete post" — nothing visible happens. The error is in the console, but the user assumes the action succeeded or the button is broken. They refresh the page to discover the post still exists.

**Fix:** Add `toast.error()` with an i18n key alongside `console.error()` in all four components.

**Confidence:** High

---

## SYS-9: Chat widget stale closure causes message loss [HIGH]

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:135-214`

The `sendMessage` function reads `messages` from state closure (line 141: `const newMessages = [...messages, userMessage]`). If the user sends message A then immediately sends message B before A's response begins streaming, message B's `newMessages` will not include message A because the `messages` state in the closure is stale.

Additionally, `sendMessage` has `messages` in its dependency array (line 215). During streaming, `messages` is updated on every chunk (lines 193-200), causing `sendMessage` to be recreated on every chunk. This cascades to `handleSend` and `handleKeyDown` being recreated on every streaming chunk.

**Failure scenario:** User sends "What is dynamic programming?" then immediately sends "Give me an example". The second message's API call doesn't include the first message in the conversation, so the AI has no context and gives a generic response. The first message is effectively lost from the conversation context.

**Fix:** Use a ref for `messages` inside `sendMessage` (`const messagesRef = useRef(messages); messagesRef.current = messages;`) to avoid stale closures. Remove `messages` from the `sendMessage` dependency array and use `messagesRef.current` instead.

**Confidence:** High

---

## SYS-10: `EditorContentContext` value object instability — cascading re-renders [HIGH]

**File:** `src/contexts/editor-content-context.tsx:14-21`

The provider passes `value={{ content, setContent }}` as an inline object literal. This creates a new reference on every render, causing all consumers of `useEditorContent()` to re-render every time the provider re-renders — even if `content` and `setContent` haven't changed. `setContent` from `useState` is stable, but wrapping it in a new object defeats that stability.

**Failure scenario:** Every keystroke in the code editor triggers a provider re-render, which causes the chat widget (a consumer of `useEditorContent`) to re-render, which recreates `sendMessage` (because it reads `editorContent?.code`), which recreates `handleSend` and `handleKeyDown`. This cascades into unnecessary re-renders of the entire chat widget on every keystroke.

**Fix:** Wrap the provider value in `useMemo`:
```tsx
const value = useMemo(() => ({ content, setContent }), [content, setContent]);
```

**Confidence:** High

---

## SYS-11: `LectureModeContext` value object instability — 11 properties [MEDIUM]

**File:** `src/components/lecture/lecture-mode-provider.tsx:119-138`

Same pattern as SYS-10 but with 11 properties. Every time any property changes (e.g., `showStats` toggle), all consumers get a new object reference and re-render, even if the specific property they use hasn't changed.

**Failure scenario:** Toggling `showStats` causes the `LectureToolbar` and all other consumers to re-render, even if they only read `active` or `fontScale`. Since the toolbar adds keyboard/mouse event listeners in `useEffect`s that depend on some of these values, unnecessary re-renders cascade into unnecessary effect re-runs and listener re-attachment.

**Fix:** Use `useMemo` for the context value, or split into smaller contexts for independent state slices.

**Confidence:** High

---

## SYS-12: Hardcoded development encryption key in source code [MEDIUM]

**File:** `src/lib/security/encryption.ts:13-16`

A fixed development encryption key is hardcoded:
```ts
Buffer.from("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f", "hex")
```

In production, `NODE_ENCRYPTION_KEY` env var is required. But if someone runs the app in development mode against a production database (or a copy of it), all encrypted values (API keys, hcaptcha secret) become decryptable with this well-known key.

**Failure scenario:** Developer runs the app locally with a copy of the production database. All encrypted API keys and secrets become decryptable. An attacker who obtains a production database dump can decrypt all encrypted fields using this publicly available key if any data was encrypted in a dev environment.

**Fix:** Remove the hardcoded key. Fail loudly at startup if `NODE_ENCRYPTION_KEY` is not set, even in development. Generate and store a dev-only key in `.env.local`.

**Confidence:** High

---

## SYS-13: Full-fidelity database exports contain live session tokens [MEDIUM]

**File:** `src/lib/db/export.ts:245-259`

`ALWAYS_REDACT` only covers `passwordHash` and `encryptedKey` in full-fidelity exports. Session tokens (`sessionToken`), OAuth tokens (`refresh_token`, `access_token`, `id_token`), worker secrets (`secretTokenHash`, `judgeClaimToken`), and contest access tokens are NOT always redacted.

**Failure scenario:** Admin downloads a full-fidelity backup, stores it on a shared drive or compromised laptop. An attacker extracts session tokens from the JSON and hijacks active user sessions.

**Fix:** Add `sessionToken`, `refresh_token`, `access_token`, `id_token`, `secretTokenHash`, `judgeClaimToken`, and contest access token fields to `ALWAYS_REDACT`.

**Confidence:** High

---

## SYS-14: Admin settings page exposes DB host/port in masked URL [MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/settings/page.tsx:92-100`

The `getDbInfo()` function reads `process.env.DATABASE_URL` and masks it as `protocol://***:***@host:port/***`. While credentials are masked, the database host and port are exposed in the RSC payload delivered to the browser.

**Failure scenario:** An attacker with admin access (or via XSS) discovers the database server's hostname and port from the masked URL, then targets the database server directly with credential brute-force or network-level attacks.

**Fix:** Only expose the database type (e.g., "PostgreSQL") and version, not the host/port. Replace the masked URL with a more restrictive display format.

**Confidence:** Medium

---

## SYS-15: Chat widget test-connection route bypasses `createApiHandler` auth [MEDIUM]

**File:** `src/app/api/v1/plugins/chat-widget/test-connection/route.ts:17`

This route sets `auth: false` on `createApiHandler`, then manually re-checks auth via `auth()` (NextAuth server-side) instead of `getApiUser()`. The `auth()` function does not check `isActive` or `tokenInvalidatedAt`, unlike `getApiUser()`. Additionally, API-key authentication is completely bypassed — an admin using an API key cannot use this endpoint.

**Failure scenario:** A deactivated user whose session cookie is still valid (but `isActive` has been set to `false`) could test chat-widget connections because the `auth()` function does not check the `isActive` field.

**Fix:** Use `auth: true` with `createApiHandler` and pass the API key through the standard `getApiUser` flow. If the endpoint needs to accept unauthenticated requests for some reason, use `csrf: true` explicitly (currently re-implements CSRF manually too).

**Confidence:** High

---

## SYS-16: Missing AbortController on polling fetches — 5 instances [MEDIUM]

Several components make fetch calls inside `useEffect` without passing an `AbortController` signal. When the component unmounts or dependencies change, the network request continues consuming resources.

| File | Lines | Context |
|------|-------|---------|
| `submissions/[id]/submission-detail-client.tsx` | 115-174 | Queue status polling — overlapping requests on rapid `isLive` toggles |
| `contest/analytics-charts.tsx` | 538-556 | Analytics fetch — state update after unmount |
| `problems/create/create-problem-form.tsx` | 216-238 | Tag suggestions — out-of-order responses from rapid typing |
| `problem/accepted-solutions.tsx` | 58-102 | Solutions fetch — `cancelled` flag guards state but not network |
| `components/submission-list-auto-refresh.tsx` | 34-57 | Time endpoint fetch — slow response blocks all future ticks |

**Failure scenario (analytics):** User clicks the analytics tab then immediately navigates away. The fetch completes after unmount, causing a React "Can't perform a React state update on an unmounted component" warning.

**Fix:** Create an `AbortController` in each `useEffect`, pass `signal` to `apiFetch`, and call `controller.abort()` in the cleanup function.

**Confidence:** High

---

## SYS-17: Missing error boundaries for contest/exam and chat widget [MEDIUM]

No dedicated error boundaries exist for:
- Contest participant views (under `src/app/(dashboard)/dashboard/contests/`)
- Exam/anti-cheat monitor (`src/components/exam/anti-cheat-monitor.tsx`)
- Countdown timer (`src/components/exam/countdown-timer.tsx`)
- Chat widget (`src/lib/plugins/chat-widget/chat-widget.tsx`)

Route-level `error.tsx` files exist at the dashboard level, but contest-specific layout and state are lost when they catch errors.

**Failure scenario:** A malformed markdown response from the AI API causes `AssistantMarkdown` to throw during rendering. The entire problem detail page crashes, not just the chat widget. For exams, a JavaScript error in `CountdownTimer` crashes the entire contest page with no recovery UI, leaving students unable to see the timer or submit.

**Fix:** Add dedicated `ErrorBoundary` components wrapping:
1. The chat widget overlay
2. Exam-critical sections (timer + anti-cheat monitor)
3. Contest participant content area

**Confidence:** Medium

---

## SYS-18: `as { error?: string }` pattern — 22 instances of unsafe type assertion [MEDIUM]

Every client-side error handler parses the API response body with `as { error?: string }` instead of using the project's already-defined `ApiErrorResponse` type from `src/types/api.ts`. This is a systemic type-safety gap.

**Key affected files:**
- `problem/problem-submission-form.tsx` (2 instances)
- `discussions/discussion-vote-buttons.tsx`
- `discussions/discussion-post-form.tsx`
- `discussions/discussion-thread-form.tsx`
- `discussions/discussion-post-delete-button.tsx`
- `discussions/discussion-thread-moderation-controls.tsx` (2 instances)
- `groups/edit-group-dialog.tsx`
- `contest/invite-participants.tsx`
- `plugins/chat-widget/admin-config.tsx`
- `groups/[id]/group-members-manager.tsx` (2 instances)
- `groups/[id]/assignment-form-dialog.tsx`
- `groups/create-group-dialog.tsx`
- `submissions/[id]/_components/comment-section.tsx`
- `admin/users/bulk-create-dialog.tsx`
- `problem-sets/_components/problem-set-form.tsx` (4 instances)
- `admin/settings/database-backup-restore.tsx`

**Failure scenario:** If the API response shape changes (e.g., `error` is renamed to `message`), none of these 22 call sites will produce a TypeScript error. The runtime behavior silently breaks — `errorBody.error` becomes `undefined`, and the fallback key is used instead of the actual error message.

**Fix:** Create a shared `parseApiError(body: unknown): string` helper that validates the shape at runtime and returns a typed error message. Replace all `as { error?: string }` casts with this helper.

**Confidence:** High

---

## SYS-19: Admin routes bypass `createApiHandler` — duplicated auth/CSRF/rate-limit boilerplate [MEDIUM]

Several admin routes are manual function handlers that duplicate the auth/CSRF/rate-limit logic that `createApiHandler` provides centrally:

| File | Manual Implementation |
|------|----------------------|
| `admin/backup/route.ts` | Manual auth + CSRF + rate limit |
| `admin/restore/route.ts` | Manual auth + CSRF + rate limit |
| `admin/migrate/export/route.ts` | Manual auth + CSRF |
| `admin/migrate/import/route.ts` | Manual auth + CSRF + 4 chained unsafe casts |
| `admin/migrate/validate/route.ts` | Manual auth + CSRF |
| `groups/[id]/assignments/route.ts` | Manual try/catch, auth, CSRF, body parsing |
| `files/route.ts` | Manual auth + CSRF + rate limit |
| `files/[id]/route.ts` | Manual auth + CSRF + rate limit |

**Failure scenario:** A security fix is applied to `createApiHandler` (e.g., adding a new header check). The 8 manual routes don't receive the fix because they bypass the centralized handler. This already happened with the chat-widget test-connection route (SYS-15), where `auth()` was used instead of `getApiUser()`.

**Fix:** Migrate these routes to use `createApiHandler` where possible. For routes that can't (streaming, file uploads), extract the shared security checks into composable middleware functions that both `createApiHandler` and manual routes call.

**Confidence:** Medium

---

## SYS-20: `migrate/import` route has 4 chained unsafe casts with no Zod validation [HIGH]

**File:** `src/app/api/v1/admin/migrate/import/route.ts:130,142,177,181-183`

The import route uses multiple chained unsafe casts:
```ts
readJsonBodyWithLimit(request) as unknown as { password?: string; data?: JudgeKitExport }
nestedData as JudgeKitExport
jsonBodyRecord as unknown as JudgeKitExport
```

No Zod validation is applied to the outer envelope or the nested `data` field. A malformed or malicious import file could inject unexpected properties that flow into the database unvalidated.

**Failure scenario:** A crafted import file includes a `data` object with extra properties (e.g., `role: "admin"`) that are not in the `JudgeKitExport` type but are not stripped because the type assertion bypasses runtime validation.

**Fix:** Create a Zod schema for `JudgeKitExport` and validate the imported data with `.safeParse()` before processing. Remove all `as unknown as` double casts.

**Confidence:** High

---

## SYS-21: JSZip statically imported in client component — ~100KB unnecessary [MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:7`

`import JSZip from "jszip"` is a top-level import in a client component. JSZip is ~100KB minified and is only used when the user clicks "Import from ZIP".

**Failure scenario:** Every page load of the problem creation form incurs ~100KB of JavaScript for JSZip, even though most users will never click "Import from ZIP". This slows initial page load.

**Fix:** Replace the static import with a dynamic import inside `handleZipImport`:
```ts
const JSZip = (await import("jszip")).default;
```

**Confidence:** High

---

## SYS-22: Recruiting validate endpoint allows token brute-force [MEDIUM]

**File:** `src/app/api/v1/recruiting/validate/route.ts:9-68`

This endpoint is intentionally unauthenticated (validates invitation tokens for non-logged-in users). It accepts a `token` field, hashes it with SHA-256, and queries the database. While it returns a uniform response for invalid tokens (preventing status enumeration), there is no rate limiting beyond the generic `recruiting:validate` key.

**Failure scenario:** If invitation tokens have low entropy (e.g., 6-digit codes), an attacker could brute-force the endpoint by hashing candidate values and sending them until the endpoint returns `{ valid: true }`.

**Fix:** Add aggressive rate limiting (e.g., 5 requests per minute per IP) and consider adding a CAPTCHA challenge after 3 failed attempts.

**Confidence:** Medium

---

## SYS-23: `files/[id]` GET route uses bare `.select()` — exposes server-side path [MEDIUM]

**File:** `src/app/api/v1/files/[id]/route.ts:72`

The route uses `.select()` (all columns) on the `files` table, returning `storedName` (the server-side filesystem path) in the API response. While the route is admin-only and the data is only used server-side for streaming the file, the full row is serialized into the response object.

**Failure scenario:** If the API response is ever logged or cached by a WAF/proxy, the server-side file path is exposed. This could reveal the directory structure of the server.

**Fix:** Use an explicit `.select()` that only includes the columns needed (e.g., `id`, `mimeType`, `originalName`, `size`), excluding `storedName` from the response payload.

**Confidence:** Medium

---

## SYS-24: CountdownTimer `useEffect` missing cleanup function [LOW]

**File:** `src/components/exam/countdown-timer.tsx:73-97`

The `useEffect` that fetches server time creates an `AbortController` and sets a `setTimeout` to abort after 5 seconds, but does not return a cleanup function. If the component unmounts before the fetch completes, `offsetRef.current` could be written to a component instance that is no longer relevant, and the abort timeout is not cleared.

**Fix:** Return a cleanup function from the `useEffect` that calls `controller.abort()` and clears the timeout.

**Confidence:** High

---

## SYS-25: Hardcoded English fallback strings in `throw new Error()` — 7 instances [LOW]

Several components use hardcoded English strings as fallback error messages in `throw new Error()`. When these errors are caught and displayed in toasts, users see raw English text.

| File | Line | String |
|------|------|--------|
| `contest/export-button.tsx` | 23 | `"export failed"` |
| `code/compiler-client.tsx` | 298 | `"Network error"` |
| `admin/roles/role-editor-dialog.tsx` | 98, 106 | `"unknown"` (shown as toast description) |
| `admin/roles/role-delete-dialog.tsx` | 51, 58 | `"unknown"` (shown as toast description) |
| `submission-list-auto-refresh.tsx` | 50 | `` `time endpoint returned ${res.status}` `` |

**Fix:** Replace hardcoded strings with i18n key identifiers (e.g., `"exportFailed"` instead of `"export failed"`). For the `"unknown"` patterns, use a generic i18n key like `t("unknownError")` instead.

**Confidence:** Medium

---

## SYS-26: Hardcoded English strings in code editor title attributes [LOW]

**File:** `src/components/code/code-editor.tsx:96,112`

- `title="Fullscreen (F) · Exit (Esc)"`
- `title="Exit fullscreen (Esc)"`

These are user-facing tooltip text that should be translated.

**Fix:** Replace with i18n keys.

**Confidence:** High

---

## SYS-27: `formData.get()` cast assertions without null/type validation — 4 routes [LOW]

Several API routes cast `FormDataEntryValue` to `File | null` or `string | null` without runtime validation:

| File | Line | Cast |
|------|------|------|
| `admin/restore/route.ts` | 38-39 | `as File \| null`, `as string \| null` |
| `admin/migrate/import/route.ts` | 41-42 | `as File \| null`, `as string \| null` |
| `admin/migrate/validate/route.ts` | 30 | `as File \| null` |
| `files/route.ts` | 39 | `as File \| null` |

**Failure scenario:** A crafted request sends `password` as a `File` object instead of a string. The `as string | null` cast succeeds at compile time, but runtime access to string methods on a `File` object throws.

**Fix:** Add runtime type checks after `formData.get()` calls. Validate that file fields are actually `File` instances and string fields are actually strings.

**Confidence:** Medium

---

## Summary by Severity

| Severity | Count | Key Issues |
|----------|-------|------------|
| **HIGH** | 6 | SYS-1 (response.ok), SYS-2 (pagination DoS), SYS-3 (missing confirm dialog), SYS-7 (raw API errors), SYS-9 (chat stale closure), SYS-20 (import unsafe casts) |
| **MEDIUM** | 14 | SYS-4 (a11y), SYS-5 (i18n compiler), SYS-6 (silent errors), SYS-8 (console.error only), SYS-10 (context stability), SYS-11 (lecture context), SYS-12 (dev encryption key), SYS-13 (export tokens), SYS-14 (DB host exposure), SYS-15 (auth bypass), SYS-16 (AbortController), SYS-17 (error boundaries), SYS-18 (unsafe casts), SYS-19 (manual routes) |
| **LOW** | 7 | SYS-21 (JSZip bundle), SYS-22 (token brute-force), SYS-23 (file path exposure), SYS-24 (timer cleanup), SYS-25 (hardcoded fallbacks), SYS-26 (tooltip i18n), SYS-27 (formData casts) |

## Top 5 Priority Remediation

1. **SYS-10 + SYS-9**: Fix `EditorContentContext` value stability with `useMemo` and fix chat widget stale closure with refs. These two together cause cascading unnecessary re-renders on every keystroke and potential data loss in the chat widget.

2. **SYS-1**: Create a `parseApiResponse(res)` helper and adopt it project-wide. This eliminates an entire class of `SyntaxError` crashes from non-JSON error bodies.

3. **SYS-7 + SYS-8**: Adopt a consistent error-display pattern: always route API error codes through `t()`, always show user-visible feedback. This is the most user-impactful set of fixes.

4. **SYS-20 + SYS-19**: Add Zod validation to the import route and migrate manual routes to `createApiHandler`. This closes the largest security validation gap and reduces maintenance risk.

5. **SYS-12 + SYS-13**: Remove the hardcoded dev encryption key and add session tokens to `ALWAYS_REDACT`. These are the most impactful security improvements with minimal code change.
