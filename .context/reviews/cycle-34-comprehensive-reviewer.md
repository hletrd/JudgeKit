# Comprehensive Code Review — Cycle 34

**Date:** 2026-04-25
**Reviewer:** comprehensive-reviewer
**Scope:** Full repository

## Findings

### NEW-1: [MEDIUM] `request.json()` without try/catch in assignments POST route

**File:** `src/app/api/v1/groups/[id]/assignments/route.ts:109`
**Confidence:** HIGH

The POST handler calls `const body = await request.json()` without a try/catch. If the client sends invalid JSON (or an empty body), this will throw an unhandled `SyntaxError` that bubbles up to the generic 500 catch block. The `createApiHandler` wrapper properly catches this (returning a 400 with "invalidJson"), but this route does NOT use `createApiHandler` — it uses raw `getApiUser`/`forbidden`/`csrfForbidden` manually. Every other non-`createApiHandler` admin route (backup, restore, migrate/export, migrate/import) wraps `request.json()` in try/catch.

**Failure scenario:** Sending `POST /api/v1/groups/123/assignments` with `Content-Type: application/json` and an empty body or malformed JSON results in a 500 Internal Server Error instead of a 400 Bad Request.

**Fix:** Wrap `request.json()` in try/catch, returning a 400 on parse failure. Or migrate this route to `createApiHandler`.

---

### NEW-2: [MEDIUM] `parseInt() || fallback` treats 0 as falsy in multiple form inputs

**Files:**
- `src/components/contest/quick-create-contest-form.tsx:133`
- `src/components/contest/quick-create-contest-form.tsx:172`
- `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:457`
- `src/app/(dashboard)/dashboard/admin/roles/role-editor-dialog.tsx:187`
- `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:320`
- `src/lib/security/ip.ts:9`

**Confidence:** MEDIUM

These use `parseInt(x, 10) || fallback` where `||` treats `0` as falsy. For most of these the `min` HTML attribute prevents 0, but `role-editor-dialog.tsx` sets `level` via `parseInt(...) || 0`, so level=0 is actually a valid value that would silently fall back to 0 (harmless here since fallback is 0). The `ip.ts` `TRUSTED_PROXY_HOPS` with `|| 1` would silently default to 1 if the env var is set to "0", which could be a security misconfiguration if someone explicitly sets 0 proxy hops.

**Fix:** Use `??` (nullish coalescing) instead of `||` for numeric parses where 0 is a valid value. At minimum, fix `src/lib/security/ip.ts:9`.

---

### NEW-3: [LOW] Chat widget `response.json()` after `!response.ok` check leaks error details

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:204`
**Confidence:** MEDIUM

In the chat widget's `handleSend`, when `!response.ok`, it does:
```ts
const data = await response.json().catch(() => ({}));
setError(data.error === "rateLimit" ? t("errorRateLimit") : t("errorGeneric"));
```
The `data.error` value comes from the API response. While the chat widget route handler returns structured error codes (not raw exception messages), comparing `data.error` against a string like `"rateLimit"` couples the client to the server's internal error key naming. If the server changes its error key, the client silently degrades to a generic error. This is a low-risk maintainability concern, not a security issue.

**Fix:** Optionally, use a more resilient pattern like checking response status codes directly instead of error string matching.

---

### NEW-4: [LOW] Missing error boundary for contests route segment

**Files:** `src/app/(dashboard)/dashboard/contests/` (no `error.tsx`)

**Confidence:** LOW

The contest segment (`/dashboard/contests/`) does not have its own `error.tsx`. The `src/app/(dashboard)/error.tsx` will catch errors, but the contest sub-section is one of the most complex areas (with real-time polling, replay, analytics) and would benefit from a specialized error boundary that offers context-specific recovery options (e.g., "Return to contest list" vs "Return to dashboard").

**Fix:** Add `src/app/(dashboard)/dashboard/contests/error.tsx` with contest-specific messaging.

---

### NEW-5: [LOW] `useSearchParams` without Suspense boundary in login/signup forms

**Files:**
- `src/app/(auth)/login/login-form.tsx:15`
- `src/app/(auth)/signup/signup-form.tsx:24`
- `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:16`
- `src/components/layout/locale-switcher.tsx:26`
- `src/lib/plugins/chat-widget/chat-widget.tsx:49`
- `src/components/layout/active-timed-assignment-sidebar-panel.tsx:44`

**Confidence:** LOW

Next.js 14+ logs a warning when `useSearchParams()` is used without a Suspense boundary at the nearest parent. This is a build-log warning that does not cause runtime failures. The components are already `"use client"`, and the pages importing them typically have Suspense. However, if any of these are used in a page without Suspense, the app will throw during static rendering.

**Fix:** Ensure all page components using these client components wrap them in `<Suspense>`. This is already done for the dashboard page. Verify for login, signup, and contest join pages.

---

### NEW-6: [LOW] `admin/languages` routes use `select()` exposing all columns including potentially sensitive Docker config

**Files:**
- `src/app/api/v1/admin/languages/route.ts:27`
- `src/app/api/v1/admin/languages/[language]/route.ts:23,74`

**Confidence:** LOW

These use `.select()` (no explicit column list) from `languageConfigs`, which exposes all columns including `dockerImage`, `compileCommand`, `runCommand`, and `dockerfile`. While these are admin-only routes (requiring `system.settings` capability), the `dockerfile` column can contain very large text (up to 10,000 chars per schema). This bloats the response unnecessarily on the list endpoint.

**Fix:** Use explicit column selects on the list endpoint, omitting `dockerfile` unless specifically requested.

---

## Swept Areas (no new issues found)

- **Auth/session handling** — proxy.ts is well-structured with proper CSRF, rate limiting, and auth cache
- **Sanitization** — DOMPurify with strict allowlists; `dangerouslySetInnerHTML` only used with sanitized content
- **Security headers** — CSP, HSTS, X-Content-Type-Options all properly set
- **Error boundaries** — present at dashboard, admin, problems, groups, submissions levels
- **API handler** — `createApiHandler` provides consistent auth, CSRF, rate limiting, and body validation
- **Recruiting validate** — uniform response for all failure cases; SQL-level time checks; SHA-256 token hashing
- **Backup/restore** — password re-confirmation, proper streaming, audit logging
- **Exam components** — proper AbortController usage, dev-only error logging
- **Contest replay** — correctly uses isomorphic layout effect (fixed in cycle 33)
- **Chat widget admin** — Test Connection button correctly checks `currentApiKeyConfigured` (fixed in cycle 33)
