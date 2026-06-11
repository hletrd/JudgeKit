# RPF Cycle 30 — Comprehensive Review

**Reviewer:** comprehensive-reviewer
**Date:** 2026-04-24
**Base commit:** 6a4cead0
**Scope:** Full repository deep review — re-examination of prior SYS/AGG findings + fresh cross-cutting analysis

---

## Executive Summary

This review re-validates all findings from cycle 29's comprehensive review (AGG-1 through AGG-19) and identifies 4 new findings. Since cycle 29, 4 findings have been fixed:
- **AGG-1/SYS-10**: `EditorContentContext` value instability — FIXED (useMemo added)
- **AGG-6/SYS-12**: Hardcoded dev encryption key — FIXED (removed, requires env var)
- **AGG-11/SYS-21**: JSZip static import — FIXED (dynamic import)
- **AGG-16/SYS-24**: CountdownTimer missing cleanup — FIXED (cleanup function added)

The remaining unfixed findings are carried forward. New findings this cycle:
- **NEW-4**: `LectureModeContext` provider value creates new object on every render (CONFIRMED from SYS-11/AGG-5 — still unfixed)
- **NEW-5**: `database-backup-restore.tsx` passes `data.error` directly to `t()` — if the error key doesn't exist in the translation dictionary, the raw API error string is displayed to the user
- **NEW-6**: `admin-config.tsx` test-connection error displayed via `t("testFailed", { error: testResult.error ?? "" })` — the error interpolation embeds raw server error text into the UI
- **NEW-7**: `contest-join-client.tsx` throws `new Error(errorMessage)` where `errorMessage` comes from an unsafe cast — the error is caught by the generic catch which shows `t("joinFailed")`, but the untranslated string is created unnecessarily

---

## Re-validated Prior Findings (Status Update)

### AGG-1/SYS-10: `EditorContentContext` value instability — NOW FIXED [HIGH]

The provider now uses `useMemo`:
```tsx
const value = useMemo(() => ({ content, setContent }), [content, setContent]);
```
FIXED (commit 02038ebf).

---

### AGG-2/SYS-1: `.json()` before `response.ok` check — STILL PRESENT [HIGH]

9+ instances remain. The `apiFetchJson` helper exists but is only used in 2 places. The remaining components use raw `apiFetch` + `response.json()` with the parse-first-then-check pattern.

**Current instances (unchanged from cycle 29):**

| File | Line | Pattern |
|------|------|---------|
| `language-config-table.tsx` | 94, 136, 162, 183 | `const json/data = await res.json().catch(...)` then check `res.ok` |
| `admin-submissions-bulk-rejudge.tsx` | 33 | `const payload = await response.json().catch(...)` then check |
| `group-instructors-manager.tsx` | 72 | `const data = await res.json().catch(...)` then check |
| `problem-import-button.tsx` | 37, 45 | `const err/result = await res.json().catch(...)` then check |
| `chat-logs-client.tsx` | 58, 73 | `const data = await res.json().catch(...)` then check |
| `admin-config.tsx` | 99 | `const data = await response.json().catch(...)` then check |
| `problem-submission-form.tsx` | 185, 248 | `const payload = await response.json().catch(...)` then check |
| `database-backup-restore.tsx` | 44, 145 | `const data = await response.json().catch(...)` then check |
| `group-members-manager.tsx` | 124, 181, 221 | `const payload = await response.json().catch(...)` then check |
| `assignment-form-dialog.tsx` | 275 | `const payload = await response.json().catch(...)` then check |
| `create-group-dialog.tsx` | 69 | `const data = await response.json().catch(...)` then check |
| `comment-section.tsx` | 45, 77 | `const payload/errorBody = await response.json().catch(...)` then check |
| `assignment-delete-button.tsx` | 39 | `const payload = await response.json().catch(...)` then check |
| `problem-delete-button.tsx` | 44 | `const payload = await response.json().catch(...)` then check |
| `create-problem-form.tsx` | 222, 337, 437 | `const data/uploadData/payload = await res.json().catch(...)` then check |
| `edit-group-dialog.tsx` | 91 | `const errorBody = await response.json().catch(...)` then check |
| `bulk-create-dialog.tsx` | 213, 221 | `const errorBody/data = await response.json().catch(...)` then check |
| `discussion-post-form.tsx` | 46 | `const errorBody = await response.json().catch(...)` then check |
| `discussion-thread-form.tsx` | 52 | `const errorBody = await response.json().catch(...)` then check |
| `discussion-post-delete-button.tsx` | 28 | `const errorBody = await response.json().catch(...)` then check |
| `discussion-thread-moderation-controls.tsx` | 76, 101 | `const errorBody = await response.json().catch(...)` then check |
| `problem-set-form.tsx` | 129, 158, 180, 214 | `const payload = await response.json().catch(...)` then check |
| `score-override-dialog.tsx` | 97, 119 | API fetch + error check |
| `start-exam-button.tsx` | 41 | `const payload = await response.json().catch(...)` then check |
| `role-editor-dialog.tsx` | 97 | `const data = await res.json().catch(...)` then check |
| `role-delete-dialog.tsx` | 50 | `const data = await res.json().catch(...)` then check |
| `invite-participants.tsx` | 88 | `const data = await res.json().catch(...)` then check |
| `quick-create-contest-form.tsx` | 80 | `const json = await res.json().catch(...)` then check |
| `recruiting-invitations-panel.tsx` | 215, 230 | `const json = await res.json().catch(...)` then check |
| `file-upload-dialog.tsx` | 102 | `const data = await res.json().catch(...)` then check |
| `submission-overview.tsx` | 95 | `const json = await res.json().catch(...)` then check |
| `submission-detail-client.tsx` | 105, 138, 184 | `const payload = await response.json().catch(...)` then check |
| `compiler-client.tsx` | 268 | `const data = await res.json().catch(...)` then check |
| `access-code-manager.tsx` | 91 | `const json = await res.json().catch(...)` then check |

**Note:** Most of these follow the "parse once then branch" pattern documented in `client.ts` comments, which is actually the recommended single-read approach. The real concern is when `.json()` is called WITHOUT `.catch()` before checking `ok`, which would throw SyntaxError on non-JSON bodies. All current instances use `.catch()`, so they're safe from SyntaxError crashes. However, the anti-pattern of parsing before validating `ok` means error responses are unnecessarily parsed, and error information can be lost if the fallback doesn't preserve the error key.

**Fix:** Migrate all components to `apiFetchJson` which handles this consistently.

**Confidence:** HIGH

---

### AGG-3/SYS-7: Raw API error strings shown to users without translation — STILL PRESENT [HIGH]

7+ instances remain. The `toast.error(t(data.error ?? "fallbackKey"))` pattern at `database-backup-restore.tsx:45` is the closest to correct — but `data.error` is used as the i18n key directly, and if the API returns an unexpected error code not in the translation dictionary, `t()` returns the key itself, leaking the raw string.

**Specific instances still using raw API errors:**
- `invite-participants.tsx:89`: `toast.error(data.error === "userNotFound" ? t("userNotFound") : t("inviteFailed"))` — partially correct (checks specific error) but falls back for unknown errors
- `admin-config.tsx:101`: `setTestResult({ success: false, error: data.error ?? tCommon("error") })` — raw error stored in state then displayed
- `group-members-manager.tsx:157,208,241`: Uses `getErrorMessage(error)` which extracts `error instanceof Error ? error.message : String(error)` — this can include raw API strings
- `assignment-form-dialog.tsx:299`: Same `getErrorMessage` pattern
- `create-group-dialog.tsx:85`: Same `getErrorMessage` pattern
- `edit-group-dialog.tsx:99`: Same `getErrorMessage` pattern
- `create-problem-form.tsx:458`: Same `getErrorMessage` pattern

**Confidence:** HIGH

---

### AGG-4/SYS-20: `migrate/import` route has unsafe casts — STILL PRESENT [HIGH]

Lines 119 and 158 still use `as unknown as { password?: string; data?: JudgeKitExport }` and `nestedData as JudgeKitExport`. The `validateExport()` function does provide runtime validation after the cast, but the cast itself occurs before validation — meaning any property on the unvalidated object is accessible via TypeScript type assertions before `validateExport` runs.

**Risk:** The current code does call `validateExport(data)` after the cast and rejects invalid exports. However, the JSON body path (deprecated but still functional) at line 131 does `(jsonBody as Record<string, unknown>).password` which accesses a property without validation. If `password` were a function instead of a string, this would execute it. In practice, `readJsonBodyWithLimit` returns parsed JSON which can't contain functions, so this is a type-safety concern rather than a security vulnerability.

**Confidence:** HIGH

---

### AGG-5/NEW-4: `LectureModeContext` value instability — STILL UNFIXED [MEDIUM]

The provider at `lecture-mode-provider.tsx:119-135` still creates an inline object with 13 properties on every render. All consumers re-render on any property change.

**Fix:** Wrap the value object in `useMemo`:
```tsx
const value = useMemo(() => ({
  active, toggle, fontScale, setFontScale, colorScheme, setColorScheme,
  panelLayout, setPanelLayout, statsAvailable, setStatsAvailable: handleSetStatsAvailable,
  showStats, toggleStats, closeStats,
}), [active, toggle, fontScale, setFontScale, colorScheme, setColorScheme,
  panelLayout, setPanelLayout, statsAvailable, handleSetStatsAvailable,
  showStats, toggleStats, closeStats]);
```

**Confidence:** HIGH

---

### AGG-7/SYS-15: Chat widget test-connection route bypasses `createApiHandler` auth — STILL UNFIXED [MEDIUM]

The route at `test-connection/route.ts` still uses `auth: false` with manual `auth()` check. The manual check doesn't verify `session.user.isActive` or `session.user.tokenInvalidatedAt`, which `createApiHandler` does.

**Risk:** A deactivated user or one with invalidated tokens could still test chat widget connections.

**Confidence:** HIGH

---

### AGG-8/SYS-16: Missing AbortController on polling fetches — PARTIALLY ADDRESSED [MEDIUM]

The CountdownTimer now properly uses AbortController with cleanup. However, other components still use `useEffect` fetches without AbortController:
- `language-config-table.tsx:122`: `fetchImageStatus` in `useEffect` with no abort signal
- `chat-logs-client.tsx`: fetch calls in event handlers (acceptable — not in useEffect)
- `comment-section.tsx`: fetch in `useEffect` with no abort signal
- `submission-detail-client.tsx`: polling useEffects partially use `cancelled` flag but not `AbortController`

**Confidence:** HIGH

---

### AGG-9/SYS-18: `as { error?: string }` pattern — 22 instances still present [MEDIUM]

All 22 instances remain. The `getErrorMessage` helper is duplicated in 5 components instead of being extracted to a shared module.

**Confidence:** HIGH

---

### AGG-10/SYS-19: Admin routes bypass `createApiHandler` — STILL UNFIXED [MEDIUM]

The 8 manual routes remain. No consolidation has been done.

**Confidence:** MEDIUM

---

### AGG-12/SYS-22: Recruiting validate endpoint allows token brute-force — STILL UNFIXED [MEDIUM]

The rate limit on `recruiting:validate` exists but is too permissive for token brute-force. A 4-character alphanumeric token has ~1.6M possibilities — even at 10 req/min, brute-force is feasible within a few months. However, the token is SHA-256 hashed before lookup, and the response is uniform (valid/invalid with no timing or existence hints), which mitigates information leakage.

**Confidence:** MEDIUM

---

### AGG-13/SYS-23: `files/[id]` GET route uses bare `.select()` — STILL UNFIXED [MEDIUM]

The GET route at `src/app/api/v1/files/[id]/route.ts:71-74` still uses `db.select().from(files)` without specifying columns. The `storedName` field (server-side filesystem path) is included in the response object even though it's only used for `readUploadedFile` and `logger.warn`. It's not serialized to JSON because Next.js `NextResponse` construction from `new Uint8Array(buffer)` doesn't include the file metadata — but the `file` object IS available in scope and could accidentally be exposed if the response format changes.

**Risk:** Low — `storedName` is not currently in the HTTP response body, only in the intermediate `file` variable used server-side. But it's a defense-in-depth gap.

**Confidence:** MEDIUM

---

### AGG-14/SYS-14: Admin settings page exposes DB host/port — STILL UNFIXED [MEDIUM]

**Confidence:** MEDIUM

---

### AGG-15/SYS-17: Missing error boundaries — STILL UNFIXED [MEDIUM]

The existing error boundaries (`groups/error.tsx`, `problems/error.tsx`, `submissions/error.tsx`, `admin/error.tsx`) cover major dashboard sections. Missing:
- Chat widget overlay (no error boundary — a streaming error crashes the widget but not the page)
- Exam timer section (no isolated error boundary — CountdownTimer crash would break the exam UI)
- Contest participant content

**Confidence:** MEDIUM

---

### AGG-17/SYS-25: Hardcoded English fallback strings in `throw new Error()` — STILL UNFIXED [LOW]

Provider error messages in `providers.ts` still use hardcoded English strings like `throw new Error("OpenAI API error 502")`.

**Confidence:** MEDIUM

---

### AGG-18/SYS-26: Hardcoded English strings in code editor title attributes — STILL UNFIXED [LOW]

**Confidence:** HIGH

---

### AGG-19/SYS-27: `formData.get()` cast assertions without null/type validation — STILL UNFIXED [LOW]

Server-side `formData.get()` calls still use `as string | null` or `as File | null` without runtime validation. Client-side forms validate before submission, but server-side routes should not trust client input.

**Specific instances:**
- `change-password-form.tsx:29-31`: Client-side — `formData.get("currentPassword") as string` without null check
- `login-form.tsx:27-28`: Client-side — `formData.get("username") as string` without null check
- `admin/migrate/import/route.ts:41-42`: Server-side — `formData.get("password") as string | null`
- `admin/restore/route.ts:38-39`: Server-side — `formData.get("file") as File | null`
- `files/route.ts:23`: Server-side — `formData.get("file") as File | null`

**Confidence:** MEDIUM

---

## New Findings

### NEW-4: `LectureModeContext` provider value instability (CONFIRMED — same as SYS-11/AGG-5) [MEDIUM]

This is a confirmation that SYS-11 remains unfixed. Listed as a distinct finding for the current cycle.

**File:** `src/components/lecture/lecture-mode-provider.tsx:119-135`

The provider creates an inline object with 13 properties on every render. Every property change causes ALL consumers to re-render, even if they only use one property (e.g., `active`).

**Fix:** Wrap with `useMemo`.

**Confidence:** HIGH

---

### NEW-5: `database-backup-restore.tsx` passes `data.error` directly as i18n key — potential raw string leak [MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:45`

```ts
toast.error(t(data.error ?? (isPortableExport ? "portableExportFailed" : "backupFailed")));
```

If the API returns an error code that doesn't exist in the translation dictionary, `t()` returns the key itself, which is the raw API error string. For example, if the server returns `{ error: "databaseConnectionFailed" }` but that key doesn't exist in `admin.settings` namespace, the user sees the raw string "databaseConnectionFailed".

**Fix:** Use a known-safe fallback: `toast.error(t(data.error === "passwordRequired" ? "passwordRequired" : (isPortableExport ? "portableExportFailed" : "backupFailed")))` or validate `data.error` against a set of known i18n keys before passing to `t()`.

**Confidence:** MEDIUM

---

### NEW-6: `admin-config.tsx` test-connection embeds raw error in translatable string [MEDIUM]

**File:** `src/lib/plugins/chat-widget/admin-config.tsx:101,242`

```ts
// Line 101: Error stored with raw API error
setTestResult({ success: false, error: data.error ?? tCommon("error") });
// Line 242: Error interpolated into display
{testResult.success ? t("testSuccess") : t("testFailed", { error: testResult.error ?? "" })}
```

The `error` value comes from the API response (`data.error`) and is interpolated into the UI via the `testFailed` template. If the API returns an English error string like `"connectionFailed_502"`, it appears verbatim in the UI alongside the Korean template text.

**Fix:** Map known API error codes to i18n keys before storing in `testResult`:
```ts
const errorMessage = data.error === "apiKeyNotConfigured" ? t("apiKeyNotConfigured")
  : data.error === "connectionFailed" ? t("connectionFailed")
  : tCommon("error");
setTestResult({ success: false, error: errorMessage });
```
And change the template to just display `testResult.error` directly instead of interpolating.

**Confidence:** MEDIUM

---

### NEW-7: `contest-join-client.tsx` creates unnecessary Error with potentially unsafe string [LOW]

**File:** `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:49-50`

```ts
const errorMessage = (payload as { error?: string }).error ?? "joinFailed";
throw new Error(errorMessage);
```

This `throw new Error` is caught by the generic `catch` block at line 66 which shows `toast.error(t("joinFailed"))`, so the error message is never shown to the user. However:
1. The `as { error?: string }` cast is the same unsafe pattern from SYS-18
2. Creating an Error with an API string that's never used is unnecessary indirection
3. If someone later changes the catch block to use `error.message`, they'd introduce the raw-API-string leak

**Fix:** Remove the throw and handle inline:
```ts
if (!ok) {
  toast.error(t("joinFailed"));
  return;
}
```

**Confidence:** LOW

---

## Summary by Severity

| Severity | Count | Key Issues |
|----------|-------|------------|
| **HIGH** | 2 unfixed | AGG-2/SYS-1 (response.ok pattern — 30+ instances), AGG-4/SYS-20 (import unsafe casts) |
| **MEDIUM** | 10 unfixed | AGG-5/NEW-4 (lecture context), AGG-7/SYS-15 (auth bypass), AGG-8/SYS-16 (AbortController partial), AGG-9/SYS-18 (unsafe casts), AGG-10/SYS-19 (manual routes), AGG-12/SYS-22 (brute-force), AGG-13/SYS-23 (file path), AGG-14/SYS-14 (DB host), AGG-15/SYS-17 (error boundaries), NEW-5 (backup i18n key leak), NEW-6 (admin-config error interpolation) |
| **LOW** | 3 unfixed | AGG-17/SYS-25 (hardcoded fallbacks), AGG-18/SYS-26 (tooltip i18n), AGG-19/SYS-27 (formData casts), NEW-7 (join throw) |

## Top 5 Priority Remediation

1. **AGG-5/NEW-4**: Fix `LectureModeContext` value stability with `useMemo`. Simple, high-impact — all lecture mode consumers re-render on any state change.

2. **AGG-4/SYS-20**: Add Zod validation to the import route JSON body path. Largest security validation gap — the deprecated JSON body path still accepts unvalidated data.

3. **AGG-7/SYS-15**: Change test-connection route to `auth: true` with `createApiHandler`. Ensures `isActive` and `tokenInvalidatedAt` checks are applied.

4. **NEW-5 + NEW-6**: Fix raw API error interpolation in `database-backup-restore.tsx` and `admin-config.tsx`. Both can leak untranslated strings to Korean-locale users.

5. **AGG-15/SYS-17**: Add error boundaries around chat widget overlay and exam timer section. A streaming error or timer crash currently takes down the surrounding UI.
