# Aggregate Review — Cycle 29

**Date:** 2026-04-26
**Reviewers:** comprehensive-reviewer
**Total findings:** 30 (27 re-validated from cycle 28 + 3 new)

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [HIGH] `EditorContentContext` value instability + chat widget `editorContent` dependency causes cascading re-renders on every keystroke

**Sources:** SYS-10, SYS-9 | **Confidence:** HIGH
**Cross-agent signal:** 2 findings from same reviewer, closely related

The `EditorContentContext.Provider` at `src/contexts/editor-content-context.tsx:17` creates a new object reference on every render via `value={{ content, setContent }}`. This causes all consumers (including `ChatWidget`) to re-render on every keystroke in the code editor. Additionally, `sendMessage` in `ChatWidget` has `editorContent?.code` and `editorContent?.language` in its dependency array, causing `sendMessage`, `handleSend`, and `handleKeyDown` to be recreated on every keystroke.

**Fix:**
1. Wrap `EditorContentContext.Provider` value in `useMemo`
2. Use a ref for `editorContent` in `sendMessage` and remove it from the dependency array

---

### AGG-2: [HIGH] `.json()` before `response.ok` check — 9+ instances of systemic anti-pattern

**Sources:** SYS-1, NEW-1 | **Confidence:** HIGH

Nine+ client-side components call `.json()` before checking `response.ok`. When a reverse proxy returns non-JSON (HTML 502), the `.json()` call throws `SyntaxError`, caught by `.catch()` which returns an empty/default object — losing the actual error information.

**Fix:** Create a project-wide `parseApiResponse(res)` helper that checks `res.ok` first, then parses JSON with `.catch(() => ({}))` on error paths.

---

### AGG-3: [HIGH] Raw API error strings shown to users without translation — 7+ instances

**Sources:** SYS-7 | **Confidence:** HIGH

Seven components display untrusted `errorBody.error` from API responses in `toast.error()` without routing through `t()`. Korean-locale users see raw English API error messages.

**Fix:** Adopt a consistent pattern where API error codes are always treated as i18n keys: `toast.error(t(errorBody.error ?? "fallbackKey"))`.

---

### AGG-4: [HIGH] `migrate/import` route has unsafe casts with no Zod validation

**Sources:** SYS-20 | **Confidence:** HIGH

The import route uses `as unknown as { password?: string; data?: JudgeKitExport }` and `nestedData as JudgeKitExport` without runtime validation. A crafted import file could inject unexpected properties into the database.

**Fix:** Create Zod schema for `JudgeKitExport` and validate with `.safeParse()`. Remove all `as unknown as` double casts.

---

### AGG-5: [MEDIUM] `LectureModeContext` value creates new object on every render

**Sources:** SYS-11, NEW-3 | **Confidence:** HIGH

Same pattern as AGG-1 but for the lecture mode context with 11 properties. Every property change causes all consumers to re-render.

**Fix:** Wrap provider value in `useMemo`.

---

### AGG-6: [MEDIUM] Hardcoded dev encryption key in source code

**Sources:** SYS-12 | **Confidence:** HIGH

`DEV_ENCRYPTION_KEY` in `src/lib/security/encryption.ts:14-16` allows anyone running dev mode against a production DB copy to decrypt all encrypted values.

**Fix:** Remove `DEV_ENCRYPTION_KEY`. Fail at startup if `NODE_ENCRYPTION_KEY` is not set. Document `.env.local` setup for development.

---

### AGG-7: [MEDIUM] Chat widget test-connection route bypasses `createApiHandler` auth

**Sources:** SYS-15 | **Confidence:** HIGH

The route uses `auth: false` and manually checks via `auth()` which doesn't verify `isActive` or `tokenInvalidatedAt`.

**Fix:** Use `auth: true` with `createApiHandler`.

---

### AGG-8: [MEDIUM] Missing AbortController on polling fetches — 5 instances

**Sources:** SYS-16 | **Confidence:** HIGH

Several components make fetch calls inside `useEffect` without `AbortController` signal. Network requests continue after unmount.

**Fix:** Create `AbortController` in each `useEffect`, pass `signal` to `apiFetch`, abort in cleanup.

---

### AGG-9: [MEDIUM] `as { error?: string }` pattern — 22 instances of unsafe type assertion

**Sources:** SYS-18, NEW-2 | **Confidence:** HIGH

Every client-side error handler parses API response with unsafe cast instead of using the project's `ApiErrorResponse` type or a shared runtime validator.

**Fix:** Create `parseApiError(body: unknown): string` helper with runtime validation.

---

### AGG-10: [MEDIUM] Admin routes bypass `createApiHandler` — duplicated security boilerplate

**Sources:** SYS-19 | **Confidence:** MEDIUM

8 manual routes duplicate auth/CSRF/rate-limit logic. Security fixes to `createApiHandler` don't propagate.

**Fix:** Migrate routes to `createApiHandler` or extract composable middleware.

---

### AGG-11: [MEDIUM] JSZip statically imported in client component — ~100KB unnecessary

**Sources:** SYS-21 | **Confidence:** HIGH

**Fix:** Replace static import with dynamic import inside `handleZipImport`.

---

### AGG-12: [MEDIUM] Recruiting validate endpoint allows token brute-force

**Sources:** SYS-22 | **Confidence:** MEDIUM

**Fix:** Add aggressive rate limiting (5 req/min per IP) and consider CAPTCHA.

---

### AGG-13: [MEDIUM] `files/[id]` GET route uses bare `.select()` — exposes `storedName`

**Sources:** SYS-23 | **Confidence:** MEDIUM

**Fix:** Use explicit `.select()` excluding `storedName` from response payload.

---

### AGG-14: [MEDIUM] Admin settings page exposes DB host/port in masked URL

**Sources:** SYS-14 | **Confidence:** MEDIUM

**Fix:** Only expose database type and version, not host/port.

---

### AGG-15: [MEDIUM] Missing error boundaries for contest/exam and chat widget

**Sources:** SYS-17 | **Confidence:** MEDIUM

**Fix:** Add dedicated `ErrorBoundary` components wrapping chat widget overlay, exam-critical sections, and contest participant content.

---

### AGG-16: [LOW] CountdownTimer `useEffect` missing cleanup function

**Sources:** SYS-24 | **Confidence:** HIGH

**Fix:** Return cleanup function that calls `controller.abort()` and `clearTimeout(timeout)`.

---

### AGG-17: [LOW] Hardcoded English fallback strings in `throw new Error()`

**Sources:** SYS-25 | **Confidence:** MEDIUM

**Fix:** Replace with i18n key identifiers.

---

### AGG-18: [LOW] Hardcoded English strings in code editor title attributes

**Sources:** SYS-26 | **Confidence:** HIGH

**Fix:** Replace with i18n keys.

---

### AGG-19: [LOW] `formData.get()` cast assertions without null/type validation

**Sources:** SYS-27 | **Confidence:** MEDIUM

**Fix:** Add runtime type checks after `formData.get()` calls.

---

## Previously Fixed Findings (verified)

- SYS-2: `normalizePage` DoS — FIXED (parseInt + MAX_PAGE)
- SYS-3: Missing confirmation dialog for thread deletion — FIXED (AlertDialog)
- SYS-8: Discussion components use `console.error()` only — FIXED (gated behind dev + toast)
- SYS-13: Session tokens in `ALWAYS_REDACT` — FIXED (commit 55abe120)

---

## Positive Observations

- All clock-skew-sensitive paths consistently use `getDbNowMs()` / `getDbNowUncached()`
- No `as any` type casts found
- Only 1 justified `eslint-disable` (react-hooks/static-components for plugin admin)
- No `@ts-ignore`, `@ts-expect-error`, or `@ts-nocheck`
- `dangerouslySetInnerHTML` usage properly sanitized (DOMPurify + safeJsonForScript)
- No `eval()`, `new Function()`, or `innerHTML` assignments
- No shell injection vectors (all `execFile`/`spawn` use argument arrays)
- ZIP bomb protection in `validateZipDecompressedSize()`
- AES-256-GCM encryption with proper auth tag handling
- Argon2id password hashing with OWASP parameters
- `chat-widget.tsx` now uses `messagesRef` and `isStreamingRef` for stale closure protection (partial fix)

## No Agent Failures

The comprehensive review completed successfully.
