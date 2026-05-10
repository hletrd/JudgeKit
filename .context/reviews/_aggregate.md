# Aggregate Review — Cycle 31

**Date:** 2026-05-09
**Cycle:** 31 of 100
**Base commit:** 975179c4
**Current HEAD:** 975179c4 (clean working tree)
**Agents:** Manual review — no agent runtime registered in `.claude/agents/`

---

## Methodology

No review agents were registered in this environment. Reviews were performed manually across security, correctness, performance, architecture, test coverage, and UI/UX dimensions.

All gates verified at HEAD:
- eslint: 0 errors
- tsc --noEmit: passes
- next build: passes
- vitest run: 315/315 files, 2382 tests (all pass)
- vitest component: 68 files, 208 tests (all pass)

---

## DEDUPLICATED FINDINGS

### C31-1: [FIXED] LectureModeContext value instability [C29 AGG-5]
**Status:** FIXED — Provider now wraps value in `useMemo` at `lecture-mode-provider.tsx:119-135`.
**Confidence:** HIGH

---

### C31-2: [FIXED] Chat widget test-connection bypasses createApiHandler [C29 AGG-7]
**Status:** FIXED — Now uses `createApiHandler({ auth: { capabilities: ["system.plugins"] } })` at `test-connection/route.ts:18`.
**Confidence:** HIGH

---

### C31-3: [FIXED] database-backup-restore passes raw API error as i18n key [C29 AGG-20]
**Status:** FIXED — `KNOWN_BACKUP_ERRORS` Set guards error keys at `database-backup-restore.tsx:13,48-52`.
**Confidence:** HIGH

---

### C31-4: [FIXED] admin-config test-connection embeds raw API error [C29 AGG-21]
**Status:** FIXED — Uses `tCommon("error")` instead of raw API error at `admin-config.tsx:99-103`.
**Confidence:** HIGH

---

### C31-5: [FIXED] contest-join-client unnecessary Error throw [C29 AGG-22]
**Status:** FIXED — Uses `apiFetchJson` helper; no `throw new Error(errorMessage)` pattern.
**Confidence:** HIGH

---

### C31-6: [FIXED] Judge claim EXTRACT(EPOCH) bigint cast [C30-1]
**Status:** FIXED — Worker path uses `::bigint` cast matching non-worker path at `claim/route.ts:199-200`.
**Confidence:** HIGH

---n

### C31-7: [FIXED] JSZip static imports [C30-2]
**Status:** FIXED — Both `export-with-files.ts` and `validation.ts` use dynamic imports.
**Confidence:** HIGH

---

### C31-8: [FIXED] parseApiResponse applied to critical components [C30-3]
**Status:** FIXED — `compiler-client.tsx` and `problem-submission-form.tsx` use `parseApiResponse()`.
**Confidence:** HIGH

---

### C31-9: [FIXED] CountdownTimer and polling AbortController cleanup [C29 AGG-8/AGG-16]
**Status:** FIXED — `countdown-timer.tsx`, `submission-detail-client.tsx`, and `language-config-table.tsx` all use AbortController with proper cleanup.
**Confidence:** HIGH

---

## CARRY-FORWARD FINDINGS (still present from prior cycles)

### C31-10: [DEFERRED] Remaining `.json()` before `.ok` in non-critical components
**Sources:** DEFER-C30-4 | **Confidence:** HIGH
**Files:** 11 lower-impact components still use manual `.json().catch()` pattern.
**Exit criterion:** Apply `parseApiResponse` helper across all remaining components.

---

### C31-11: [DEFERRED] Raw API error strings without i18n translation
**Sources:** DEFER-C30-5 / C29 AGG-3 | **Confidence:** HIGH
**Files:** Multiple client components (7+ instances)
**Exit criterion:** Unified API error parsing helper that routes through `t()`.

---

### C31-12: [DEFERRED] `as { error?: string }` unsafe type assertions (22+ instances)
**Sources:** DEFER-C30-6 / C29 AGG-9 | **Confidence:** HIGH
**Exit criterion:** Typed `parseApiError` helper replaces all manual casts.

---

### C31-13: [DEFERRED] Admin routes bypass createApiHandler
**Sources:** C29 AGG-10 | **Confidence:** MEDIUM
**Files:** 15 manual routes duplicate auth/CSRF/rate-limit logic.
**Exit criterion:** Migrate routes to `createApiHandler` or extract composable middleware.

---

### C31-14: [DEFERRED] Recruiting validate endpoint token brute-force
**Sources:** C29 AGG-12 | **Confidence:** MEDIUM
**File:** `src/app/api/v1/recruiting/validate/route.ts`
Uses global IP-based API rate limit. Consider dedicated aggressive limit (5 req/min per IP).
**Exit criterion:** Add dedicated recruiting validation rate limit.

---

### C31-15: [DEFERRED] Missing error boundaries
**Sources:** C29 AGG-15 | **Confidence:** MEDIUM
Missing: chat widget overlay, exam timer section, contest participant content.
**Exit criterion:** Add dedicated ErrorBoundary components.

---

### C31-16: [DEFERRED] Hardcoded English strings in code editor defaults
**Sources:** C29 AGG-18 | **Confidence:** HIGH
**File:** `src/components/code/code-editor.tsx:36`
Default props: `fullscreenLabel = "Fullscreen (F)"`, `exitFullscreenLabel = "Exit fullscreen (Esc)"`, etc.
**Exit criterion:** Replace with i18n keys or ensure all callers pass translated strings.

---

### C31-17: [DEFERRED] Hardcoded English in throw new Error
**Sources:** C29 AGG-17 | **Confidence:** MEDIUM
**File:** `src/lib/auth/permissions.ts:69,76,88,96,101`
**Exit criterion:** Replace with i18n key identifiers.

---

### C31-18: [DEFERRED] formData.get() cast assertions without validation
**Sources:** C29 AGG-19 | **Confidence:** MEDIUM
**Files:** Multiple server routes. Most have runtime validation after cast.
**Exit criterion:** Add runtime type checks after all `formData.get()` calls.

---

### C31-19: [DEFERRED] Admin settings page exposes DB host/port
**Sources:** C29 AGG-14 | **Confidence:** MEDIUM
**Exit criterion:** Only expose database type and version, not host/port.

---

### C31-20: [DEFERRED] files/[id] GET selects storedName
**Sources:** C29 AGG-13 | **Confidence:** LOW
**File:** `src/app/api/v1/files/[id]/route.ts:76`
`storedName` needed for file read but not in response. Response manually constructed.
**Exit criterion:** Add explicit column exclusion comment or refactor.

---

## NEW FINDINGS (Cycle 31)

### C31-21: [LOW] compiler-client uses res.statusText as error fallback
**File:** `src/components/code/compiler-client.tsx:268`
`res.statusText` (always English) may be displayed to Korean users in test case error state.
**Fix:** Remove `res.statusText` from fallback chain; use only translated strings.
**Confidence:** LOW

---

### C31-22: [LOW] json-ld RegExp creation per call
**File:** `src/components/seo/json-ld.tsx:17-18`
Creates `new RegExp(...)` on every `safeJsonForScript` invocation. Can be module-level constants.
**Fix:** Extract to module-level constants.
**Confidence:** LOW

---

## Positive Observations

- `apiFetchJson` and `parseApiResponse` helpers are well-documented with JSDoc
- Critical user-facing paths (compiler, submission, exam) now use safe response parsing
- `EditorContentContext` and `LectureModeContext` are properly stabilized with `useMemo`
- Chat widget test-connection properly enforces capability-based auth
- Encryption key is always required from env var (no hardcoded fallback)
- All clock-skew-sensitive paths use `getDbNowMs()` / `getDbNowUncached()`
- No `as any` type casts found
- No `@ts-ignore`, `@ts-expect-error`, or `@ts-nocheck`
- `dangerouslySetInnerHTML` usage properly sanitized (DOMPurify + safeJsonForScript)
- No shell injection vectors (all `execFile`/`spawn` use argument arrays)
- ZIP bomb protection in `validateZipDecompressedSize()`
- AES-256-GCM encryption with proper auth tag handling
- `validateExport()` provides runtime validation for import paths
- Database backup/restore uses `takePreRestoreSnapshot()` for rollback safety
- Judge claim uses atomic SQL with `FOR UPDATE SKIP LOCKED`

## No Agent Failures

The comprehensive review completed successfully.
