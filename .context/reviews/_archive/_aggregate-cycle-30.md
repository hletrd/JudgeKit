# Aggregate Review — Cycle 30

**Date:** 2026-04-24
**Reviewers:** comprehensive-reviewer
**Total findings:** 19 (15 re-validated from cycle 29 + 4 new/confirmed)

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [HIGH] `EditorContentContext` value instability — FIXED

**Status:** FIXED in commit 02038ebf (useMemo added)

---

### AGG-2: [HIGH] `.json()` before `response.ok` check — 30+ instances of systemic anti-pattern

**Sources:** SYS-1 | **Confidence:** HIGH

30+ client-side components call `.json()` before checking `response.ok`. While all use `.catch()` (preventing SyntaxError crashes), the pattern unnecessarily parses error response bodies and can lose error information through the fallback value. The `apiFetchJson` helper exists but is only used in 2 places.

**Fix:** Systematically migrate all components from `apiFetch` + manual `.json().catch()` to `apiFetchJson`.

---

### AGG-3: [HIGH] Raw API error strings shown to users without translation — 7+ instances

**Sources:** SYS-7 | **Confidence:** HIGH

Seven components display untrusted `errorBody.error` from API responses in `toast.error()` without routing through `t()`. Korean-locale users see raw English API error messages.

**Fix:** Adopt a consistent pattern where API error codes are always treated as i18n keys: `toast.error(t(errorBody.error ?? "fallbackKey"))` or map known error codes explicitly.

---

### AGG-4: [HIGH] `migrate/import` route has unsafe casts with no Zod validation

**Sources:** SYS-20 | **Confidence:** HIGH

The import route uses `as unknown as { password?: string; data?: JudgeKitExport }` and `nestedData as JudgeKitExport` without runtime validation. A crafted import file could inject unexpected properties into the database.

**Fix:** Create Zod schema for `JudgeKitExport` and validate with `.safeParse()`. Remove all `as unknown as` double casts.

---

### AGG-5: [MEDIUM] `LectureModeContext` value creates new object on every render

**Sources:** SYS-11, NEW-4 | **Confidence:** HIGH
**Cross-agent signal:** Confirmed unfixed across multiple cycles

Same pattern as AGG-1 (now fixed). The provider at `lecture-mode-provider.tsx:119-135` creates an inline object with 13 properties on every render. Every property change causes all consumers to re-render.

**Fix:** Wrap provider value in `useMemo`.

---

### AGG-6: [MEDIUM] Hardcoded dev encryption key — FIXED

**Status:** FIXED in commit 2e765321 (key removed, env var required)

---

### AGG-7: [MEDIUM] Chat widget test-connection route bypasses `createApiHandler` auth

**Sources:** SYS-15 | **Confidence:** HIGH

The route uses `auth: false` and manually checks via `auth()` which doesn't verify `isActive` or `tokenInvalidatedAt`. A deactivated user or one with invalidated tokens could still test chat widget connections.

**Fix:** Use `auth: true` with `createApiHandler`.

---

### AGG-8: [MEDIUM] Missing AbortController on polling fetches — partially addressed

**Sources:** SYS-16 | **Confidence:** HIGH

CountdownTimer now properly uses AbortController with cleanup. Other components still use `useEffect` fetches without AbortController:
- `language-config-table.tsx:122`: `fetchImageStatus` in `useEffect` with no abort signal
- `comment-section.tsx`: fetch in `useEffect` with no abort signal
- `submission-detail-client.tsx`: polling useEffects partially use `cancelled` flag but not `AbortController`

**Fix:** Create `AbortController` in each `useEffect`, pass `signal` to `apiFetch`, abort in cleanup.

---

### AGG-9: [MEDIUM] `as { error?: string }` pattern — 22 instances of unsafe type assertion

**Sources:** SYS-18 | **Confidence:** HIGH

Every client-side error handler parses API response with unsafe cast instead of using a shared runtime validator. The `getErrorMessage` helper is duplicated in 5 components.

**Fix:** Create `parseApiError(body: unknown): string` helper with runtime validation and use it consistently.

---

### AGG-10: [MEDIUM] Admin routes bypass `createApiHandler` — duplicated security boilerplate

**Sources:** SYS-19 | **Confidence:** MEDIUM

8 manual routes duplicate auth/CSRF/rate-limit logic. Security fixes to `createApiHandler` don't propagate.

**Fix:** Migrate routes to `createApiHandler` or extract composable middleware.

---

### AGG-11: [MEDIUM] JSZip statically imported in client component — FIXED

**Status:** FIXED in commit d4286f8b (dynamic import)

---

### AGG-12: [MEDIUM] Recruiting validate endpoint allows token brute-force

**Sources:** SYS-22 | **Confidence:** MEDIUM

Rate limit is too permissive for token brute-force. SHA-256 hashing and uniform responses mitigate information leakage.

**Fix:** Add aggressive rate limiting (5 req/min per IP) and consider CAPTCHA.

---

### AGG-13: [MEDIUM] `files/[id]` GET route uses bare `.select()` — exposes `storedName`

**Sources:** SYS-23 | **Confidence:** MEDIUM

The GET route selects all columns from the `files` table. `storedName` is not in the HTTP response currently, but is in scope and could accidentally be exposed if the response format changes.

**Fix:** Use explicit `.select()` excluding `storedName` from the query result.

---

### AGG-14: [MEDIUM] Admin settings page exposes DB host/port in masked URL

**Sources:** SYS-14 | **Confidence:** MEDIUM

**Fix:** Only expose database type and version, not host/port.

---

### AGG-15: [MEDIUM] Missing error boundaries for contest/exam and chat widget

**Sources:** SYS-17 | **Confidence:** MEDIUM

Existing error boundaries cover major dashboard sections. Missing:
- Chat widget overlay — streaming error crashes the widget but not the page
- Exam timer section — CountdownTimer crash breaks the exam UI
- Contest participant content

**Fix:** Add dedicated `ErrorBoundary` components wrapping chat widget overlay, exam-critical sections, and contest participant content.

---

### AGG-16: [LOW] CountdownTimer `useEffect` missing cleanup function — FIXED

**Status:** FIXED in commit db799cc4 (cleanup function added)

---

### AGG-17: [LOW] Hardcoded English fallback strings in `throw new Error()`

**Sources:** SYS-25 | **Confidence:** MEDIUM

Provider error messages in `providers.ts` still use hardcoded English strings.

**Fix:** Replace with i18n key identifiers.

---

### AGG-18: [LOW] Hardcoded English strings in code editor title attributes

**Sources:** SYS-26 | **Confidence:** HIGH

**Fix:** Replace with i18n keys.

---

### AGG-19: [LOW] `formData.get()` cast assertions without null/type validation

**Sources:** SYS-27 | **Confidence:** MEDIUM

Server-side `formData.get()` calls use `as string | null` or `as File | null` without runtime validation.

**Fix:** Add runtime type checks after `formData.get()` calls.

---

### AGG-20: [MEDIUM] `database-backup-restore.tsx` passes `data.error` directly as i18n key

**Sources:** NEW-5 | **Confidence:** MEDIUM

**File:** `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:45`

```ts
toast.error(t(data.error ?? (isPortableExport ? "portableExportFailed" : "backupFailed")));
```

If the API returns an error code not in the translation dictionary, `t()` returns the key itself — the raw API error string is displayed to the user.

**Fix:** Validate `data.error` against known i18n keys before passing to `t()`.

---

### AGG-21: [MEDIUM] `admin-config.tsx` test-connection embeds raw error in translatable string

**Sources:** NEW-6 | **Confidence:** MEDIUM

**File:** `src/lib/plugins/chat-widget/admin-config.tsx:101,242`

The `error` value from the API response is stored and then interpolated into the `testFailed` template. If the API returns an English error string, it appears verbatim alongside Korean template text.

**Fix:** Map known API error codes to i18n keys before storing in `testResult`.

---

### AGG-22: [LOW] `contest-join-client.tsx` creates unnecessary Error with potentially unsafe string

**Sources:** NEW-7 | **Confidence:** LOW

**File:** `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:49-50`

Creates `throw new Error(errorMessage)` where `errorMessage` comes from an unsafe cast. The error is caught by a generic catch that shows `t("joinFailed")`, so it's never displayed. But the pattern is unnecessary and risky if the catch block is later changed.

**Fix:** Handle the error inline instead of throwing.

---

## Previously Fixed Findings (verified this cycle)

- AGG-1/SYS-10: `EditorContentContext` value instability — FIXED (useMemo)
- AGG-6/SYS-12: Hardcoded dev encryption key — FIXED (removed)
- AGG-11/SYS-21: JSZip static import — FIXED (dynamic import)
- AGG-16/SYS-24: CountdownTimer missing cleanup — FIXED (cleanup function)

---

## Positive Observations

- `apiFetchJson` helper exists with proper docs and JSDoc — just needs broader adoption
- `apiFetch` + `.json().catch()` pattern is used consistently (avoids SyntaxError crashes)
- `validateExport()` provides runtime validation for the multipart import path
- `EditorContentContext` and chat widget `editorContentRef` are now properly stabilized
- Encryption key is now always required from env var
- CountdownTimer has proper cleanup with AbortController
- All clock-skew-sensitive paths use `getDbNowMs()` / `getDbNowUncached()`
- No `as any` type casts found
- No `@ts-ignore`, `@ts-expect-error`, or `@ts-nocheck`
- `dangerouslySetInnerHTML` usage properly sanitized (DOMPurify + safeJsonForScript)
- No shell injection vectors (all `execFile`/`spawn` use argument arrays)
- ZIP bomb protection in `validateZipDecompressedSize()`
- AES-256-GCM encryption with proper auth tag handling

## No Agent Failures

The comprehensive review completed successfully.
