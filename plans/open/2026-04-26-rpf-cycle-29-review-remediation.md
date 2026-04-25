# RPF Cycle 29 Review Remediation Plan

**Date:** 2026-04-26
**Source:** `.context/reviews/_aggregate-cycle-29.md`
**Status:** In Progress

## Scope

This cycle addresses the highest-impact findings from the cycle-29 review, focusing on:

- AGG-1: `EditorContentContext` value instability + chat widget `editorContent` dependency
- AGG-16: CountdownTimer `useEffect` missing cleanup function
- AGG-6: Hardcoded dev encryption key
- AGG-11: JSZip statically imported in client component

Lower-severity and wider-scope items are deferred per the rules below.

No cycle-29 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Fix `EditorContentContext` value stability and chat widget `editorContent` dependency (AGG-1)

- **Source:** AGG-1 (SYS-10, SYS-9)
- **Severity / confidence:** HIGH / HIGH
- **Citations:** `src/contexts/editor-content-context.tsx:17`, `src/lib/plugins/chat-widget/chat-widget.tsx:243`
- **Problem:** The `EditorContentContext.Provider` creates a new object reference on every render, causing all consumers (including `ChatWidget`) to re-render on every keystroke. Additionally, `sendMessage` in `ChatWidget` has `editorContent?.code` and `editorContent?.language` in its dependency array, causing `sendMessage`, `handleSend`, and `handleKeyDown` to be recreated on every keystroke.
- **Plan:**
  1. Wrap `EditorContentContext.Provider` value in `useMemo` in `src/contexts/editor-content-context.tsx`.
  2. Add `editorContentRef` to `ChatWidget`, synced via `useEffect`, similar to existing `messagesRef`.
  3. Use `editorContentRef.current?.code` and `editorContentRef.current?.language` in `sendMessage` instead of reading from closure.
  4. Remove `editorContent?.code` and `editorContent?.language` from `sendMessage` dependency array.
  5. Verify all gates pass.
- **Status:** DONE (commit 02038ebf)

---

### H2: Fix CountdownTimer `useEffect` missing cleanup function (AGG-16)

- **Source:** AGG-16 (SYS-24)
- **Severity / confidence:** LOW / HIGH
- **Citations:** `src/components/exam/countdown-timer.tsx:62-89`
- **Problem:** The `useEffect` that fetches server time creates an `AbortController` and `setTimeout` but does not return a cleanup function. If the component unmounts before the fetch completes, `offsetRef.current` could be written to a stale component instance, and the abort timeout is not cleared.
- **Plan:**
  1. Add a return cleanup function to the `useEffect` that calls `controller.abort()` and `clearTimeout(timeout)`.
  2. Verify all gates pass.
- **Status:** DONE (commit db799cc4)

---

### H3: Remove hardcoded dev encryption key (AGG-6)

- **Source:** AGG-6 (SYS-12)
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/lib/security/encryption.ts:14-16`
- **Problem:** A fixed development encryption key is hardcoded in source code. Anyone running the app in development mode against a production database copy can decrypt all encrypted values (API keys, hcaptcha secret).
- **Plan:**
  1. Remove `DEV_ENCRYPTION_KEY` constant.
  2. Update `getKey()` to throw if `NODE_ENCRYPTION_KEY` is not set, regardless of `NODE_ENV`.
  3. Add a startup-time log message guiding developers to set `NODE_ENCRYPTION_KEY` in `.env.local`.
  4. Verify all gates pass.
- **Status:** DONE (commit 2e765321)

---

### H4: Dynamic-import JSZip in client component (AGG-11)

- **Source:** AGG-11 (SYS-21)
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:7`
- **Problem:** `import JSZip from "jszip"` is a top-level import in a client component. JSZip is ~100KB minified and is only used when the user clicks "Import from ZIP". Every page load incurs this cost.
- **Plan:**
  1. Replace the static import with a dynamic import inside `handleZipImport`: `const JSZip = (await import("jszip")).default;`
  2. Verify all gates pass.
- **Status:** DONE (commit d4286f8b)

---

## Deferred items

### DEFER-1 through DEFER-21: Carried from cycle 27/28 plan

All prior deferred items (DEFER-1 through DEFER-21 from cycle 27 plan) remain unchanged. See the cycle 27 plan for full details.

### DEFER-22: [HIGH] `.json()` before `response.ok` check — systemic anti-pattern (AGG-2)

- **File+line:** 9+ instances across client components (see SYS-1 in review)
- **Original severity/confidence:** HIGH / HIGH
- **Reason for deferral:** Requires creating a project-wide `parseApiResponse(res)` helper and migrating 9+ call sites. This is a wider refactor that could break existing error-handling behavior if not carefully tested. Better addressed in a dedicated cycle.
- **Exit criterion:** A dedicated cycle creates the `parseApiResponse` helper, adds tests, and migrates all instances.

### DEFER-23: [HIGH] Raw API error strings shown to users without translation (AGG-3)

- **File+line:** 7+ instances (see SYS-7 in review)
- **Original severity/confidence:** HIGH / HIGH
- **Reason for deferral:** Requires creating a shared error-translation pattern and migrating 7+ call sites. Needs careful i18n key coordination. Better addressed alongside DEFER-22 in a dedicated i18n/error-handling cycle.
- **Exit criterion:** A dedicated cycle creates the `parseApiError` helper and migrates all instances.

### DEFER-24: [HIGH] `migrate/import` route has unsafe casts with no Zod validation (AGG-4)

- **File+line:** `src/app/api/v1/admin/migrate/import/route.ts:119,142,157`
- **Original severity/confidence:** HIGH / HIGH
- **Reason for deferral:** Requires creating a comprehensive Zod schema for `JudgeKitExport` (30+ tables, each with their own column types). This is a significant amount of work that should be done carefully in a dedicated cycle.
- **Exit criterion:** A dedicated cycle creates the Zod schema, adds tests, and replaces all unsafe casts.

### DEFER-25: [MEDIUM] `LectureModeContext` value creates new object on every render (AGG-5)

- **File+line:** `src/components/lecture/lecture-mode-provider.tsx:119-135`
- **Original severity/confidence:** MEDIUM / HIGH
- **Reason for deferral:** Same pattern as AGG-1 but the lecture mode context has 11 properties, making the `useMemo` dependency list very long. Should be done alongside a review of whether the context should be split into smaller contexts.
- **Exit criterion:** A dedicated cycle wraps the provider value in `useMemo` or splits the context.

### DEFER-26: [MEDIUM] Chat widget test-connection route bypasses `createApiHandler` auth (AGG-7)

- **File+line:** `src/app/api/v1/plugins/chat-widget/test-connection/route.ts:21`
- **Original severity/confidence:** MEDIUM / HIGH
- **Reason for deferral:** This route deliberately bypasses `createApiHandler` because it needs to test external API connections (OpenAI, Claude, Gemini) which have their own auth headers. The fix requires carefully designing how API-key auth interacts with the test-connection flow.
- **Exit criterion:** A dedicated cycle redesigns the auth flow for this route.

### DEFER-27: [MEDIUM] Missing AbortController on polling fetches (AGG-8)

- **File+line:** 5 instances (see SYS-16 in review)
- **Original severity/confidence:** MEDIUM / HIGH
- **Reason for deferral:** Requires migrating 5 components to use `AbortController` pattern. Each migration needs careful testing to ensure network requests are properly cancelled on unmount without breaking polling behavior.
- **Exit criterion:** A dedicated cycle adds `AbortController` to all 5 instances.

### DEFER-28: [MEDIUM] `as { error?: string }` pattern — 22 instances (AGG-9)

- **File+line:** 22 instances (see SYS-18 in review)
- **Original severity/confidence:** MEDIUM / HIGH
- **Reason for deferral:** Should be addressed alongside DEFER-22 and DEFER-23 as part of a unified error-handling cleanup cycle.
- **Exit criterion:** A dedicated cycle creates the `parseApiError` helper and migrates all instances.

### DEFER-29: [MEDIUM] Admin routes bypass `createApiHandler` — 8 instances (AGG-10)

- **File+line:** 8 manual routes (see SYS-19 in review)
- **Original severity/confidence:** MEDIUM / MEDIUM
- **Reason for deferral:** Large refactor scope — 8 routes need migration to `createApiHandler` or extraction of composable middleware. Some routes (streaming, file uploads) may not fit the standard pattern.
- **Exit criterion:** A dedicated cycle migrates routes or extracts composable middleware.

### DEFER-30: [MEDIUM] Recruiting validate endpoint allows token brute-force (AGG-12)

- **File+line:** `src/app/api/v1/recruiting/validate/route.ts:9-68`
- **Original severity/confidence:** MEDIUM / MEDIUM
- **Reason for deferral:** The endpoint already has generic rate limiting. Adding aggressive rate limiting (5 req/min per IP) and CAPTCHA requires design decisions about UX impact on legitimate users.
- **Exit criterion:** A dedicated cycle designs and implements the enhanced rate limiting.

### DEFER-31: [MEDIUM] `files/[id]` GET route exposes `storedName` (AGG-13)

- **File+line:** `src/app/api/v1/files/[id]/route.ts:72`
- **Original severity/confidence:** MEDIUM / MEDIUM
- **Reason for deferral:** The route is admin-only and `storedName` is only used server-side for streaming the file. However, the full row is in the response object. Fix requires an explicit `.select()` call.
- **Exit criterion:** A dedicated cycle adds explicit `.select()` to exclude `storedName`.

### DEFER-32: [MEDIUM] Admin settings page exposes DB host/port (AGG-14)

- **File+line:** `src/app/(dashboard)/dashboard/admin/settings/page.tsx:92-100`
- **Original severity/confidence:** MEDIUM / MEDIUM
- **Reason for deferral:** Requires design decision on what DB info to show in admin UI. The current masked URL format was intentionally designed for debugging.
- **Exit criterion:** A dedicated cycle redesigns the DB info display.

### DEFER-33: [MEDIUM] Missing error boundaries for contest/exam and chat widget (AGG-15)

- **File+line:** Multiple components (see SYS-17 in review)
- **Original severity/confidence:** MEDIUM / MEDIUM
- **Reason for deferral:** Requires designing and implementing dedicated `ErrorBoundary` components with proper fallback UI (i18n-aware, accessible). Multiple components need wrapping.
- **Exit criterion:** A dedicated cycle implements error boundaries for exam-critical and chat widget components.

### DEFER-34: [LOW] Hardcoded English fallback strings in `throw new Error()` (AGG-17)

- **File+line:** 7 instances (see SYS-25 in review)
- **Original severity/confidence:** LOW / MEDIUM
- **Reason for deferral:** Low severity; the hardcoded strings are fallbacks that only appear in unexpected error paths.
- **Exit criterion:** A dedicated i18n cleanup cycle replaces all hardcoded error strings.

### DEFER-35: [LOW] Hardcoded English strings in code editor title attributes (AGG-18)

- **File+line:** `src/components/code/code-editor.tsx:96,112`
- **Original severity/confidence:** LOW / HIGH
- **Reason for deferral:** Low severity; only affects tooltip text visibility.
- **Exit criterion:** A dedicated i18n cleanup cycle replaces hardcoded strings.

### DEFER-36: [LOW] `formData.get()` cast assertions without validation (AGG-19)

- **File+line:** 4 routes (see SYS-27 in review)
- **Original severity/confidence:** LOW / MEDIUM
- **Reason for deferral:** Low severity; requires runtime type checks after `formData.get()` calls in 4 admin routes.
- **Exit criterion:** A dedicated cycle adds runtime type validation to all `formData.get()` calls.

---

## Progress log

- 2026-04-26: Plan created from cycle-29 aggregate review. 4 implementation tasks (H1-H4), 15 new deferred items (DEFER-22 through DEFER-36).
- 2026-04-26: H1 DONE — wrapped EditorContentContext.Provider value in useMemo, added editorContentRef to ChatWidget, removed editorContent from sendMessage deps (commit 02038ebf).
- 2026-04-26: H2 DONE — added cleanup function to CountdownTimer server-time useEffect (commit db799cc4).
- 2026-04-26: H3 DONE — removed DEV_ENCRYPTION_KEY, getKey() now always throws if NODE_ENCRYPTION_KEY is missing (commit 2e765321).
- 2026-04-26: H4 DONE — replaced static JSZip import with dynamic import inside handleZipImport (commit d4286f8b).
- 2026-04-26: All gates green (eslint 0, tsc clean, vitest 302/302 2197 tests, next build success).
