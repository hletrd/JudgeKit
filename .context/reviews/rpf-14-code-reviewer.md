# RPF Cycle 14 - Code Reviewer

**Date:** 2026-04-20
**Base commit:** c39ded3b
**Scope:** Full repository

## Findings

### CR-1: API key creation accepts client-computed expiresAt without server-side validation [MEDIUM/HIGH]

**File:** `src/app/api/v1/admin/api-keys/route.ts:81`
**Code:** `expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,`

**Description:** The API key creation endpoint accepts the `expiresAt` timestamp verbatim from the client request body. The client (`api-keys-client.tsx:162`) computes this using `new Date(Date.now() + days * 86400000)`, which uses browser time. If the browser clock is skewed, the stored `expiresAt` will be inconsistent with the `NOW()`-based `isExpired` comparison in the GET endpoint (line 33: `CASE WHEN expiresAt < NOW()`).

This is the same class of bug as the client-side expiry badges that were fixed in prior cycles, but it's worse: here the inconsistent timestamp is *persisted* to the database, not just a display issue.

**Concrete failure scenario:** Admin's browser clock is 1 hour behind server time. They create an API key with "30d" expiry. The stored `expiresAt` is 1 hour earlier than it should be. The key appears expired 1 hour before the admin intended. Conversely, if the browser is ahead, the key remains valid longer than intended.

**Fix:** The server should compute the `expiresAt` timestamp using DB time. Change the API to accept a duration (e.g., `expiryDays: 30`) instead of a computed ISO timestamp, then compute `expiresAt` server-side using `getDbNowUncached()`.

**Confidence:** High

### CR-2: Recruiting invitation creation accepts client-computed expiresAt [MEDIUM/HIGH]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:141`
**API route:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts`

**Description:** Same pattern as CR-1. The client computes `expiresAt = new Date(Date.now() + days * 86400000).toISOString()` using browser time and sends it to the server. The server stores this client-computed timestamp. If browser clock is skewed relative to the DB server, the invitation will expire at a different time than intended.

**Fix:** Same approach as CR-1: accept `expiryDays` on the server and compute `expiresAt` using DB time.

**Confidence:** High

### CR-3: `withUpdatedAt()` defaults to `new Date()` instead of DB time [MEDIUM/MEDIUM]

**File:** `src/lib/db/helpers.ts:20`
**Code:** `return { ...data, updatedAt: now ?? new Date() };`

**Description:** The helper `withUpdatedAt()` falls back to `new Date()` when no `now` parameter is provided. Of the 11 call sites found in the codebase, only 2 pass `now` explicitly (`plugins.ts:52`, `api-keys/[id]/route.ts:53`). The remaining 9 callers use the `new Date()` fallback, producing `updatedAt` timestamps that may differ from DB-time by seconds or minutes depending on clock skew. This is the same maintenance trap that was fixed in `createBackupIntegrityManifest` (made `dbNow` required) and `getContestStatus` (removed `new Date()` default).

**Fix:** Either make `now` a required parameter (like was done for `createBackupIntegrityManifest`), or change the default to throw if not provided, forcing callers to be explicit about the time source.

**Confidence:** High

### CR-4: Submissions page server component uses `new Date()` for period start [LOW/MEDIUM]

**File:** `src/app/(public)/submissions/page.tsx:67`
**Code:** `const now = new Date();`

**Description:** The `getPeriodStart()` function uses `new Date()` to compute period boundaries (today, week, month). Since this is a server component, it should use `getDbNow()` for consistency. If the app server clock differs from the DB server, submissions from the "current" period could be excluded or included incorrectly.

**Impact:** Low - the discrepancy would be at most a few seconds/minutes at period boundaries, and this is a display filter, not a security gate.

**Fix:** Call `getDbNow()` at the top of the page component and pass it to `getPeriodStart()`.

**Confidence:** Medium

### CR-5: User profile activity heatmap uses `new Date()` in server component [LOW/LOW]

**File:** `src/app/(public)/users/[id]/page.tsx:171`
**Code:** `const day = new Date();`

**Description:** The activity heatmap generates the 90-day window using `new Date()`. Same clock-skew concern as CR-4 but even less impactful since it's just a visual display.

**Fix:** Use `getDbNow()` for consistency.

**Confidence:** Low

### CR-6: `useEffect` cleanup timer depends on `t` translation function [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:98-105`
**Code:**
```typescript
useEffect(() => () => {
  if (createdKeyCopiedTimer.current) clearTimeout(createdKeyCopiedTimer.current);
  if (copiedKeyIdTimer.current) clearTimeout(copiedKeyIdTimer.current);
}, [t]);
```

**Description:** The cleanup effect for timers has `[t]` in its dependency array. The `t` function reference changes when the locale changes, causing the effect to re-run and clear timers unnecessarily. Since the cleanup function only clears timers (it doesn't depend on `t`), the dependency should be `[]`. When locale changes mid-countdown, the copy feedback timer would be cleared, and the "Copied" state would persist indefinitely instead of reverting after 2 seconds.

**Fix:** Change the dependency array to `[]` since the cleanup function does not use `t`.

**Confidence:** High

### CR-7: `document.execCommand("copy")` is deprecated [LOW/LOW]

**Files:**
- `src/components/code/copy-code-button.tsx:28`
- `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:220`

**Description:** Both copy-button implementations fall back to `document.execCommand("copy")` when `navigator.clipboard.writeText()` fails. This API is deprecated and may be removed from browsers in the future. Currently functional as a fallback, but represents a latent breakage risk.

**Fix:** Consider using the Clipboard API exclusively, or use a dedicated clipboard library. This is a very low priority since it's only a fallback.

**Confidence:** Low

## Verified Safe / No Regression Found

- `createBackupIntegrityManifest`: `dbNow` is now required parameter - verified.
- Backup download filename: uses `Content-Disposition` header - verified.
- API key status badges: use server-computed `isExpired` - verified.
- Recruiting invitation status badges: use server-computed `isExpired` - verified.
- Hardcoded "Loading..." text: replaced with `tCommon("loading")` - verified.
- `streamDatabaseExport`: accepts `dbNow` parameter - verified.
- `streamBackupWithFiles`: accepts and passes `dbNow` - verified.
- Backup route: fetches `getDbNowUncached()` once and passes through pipeline - verified.
- Auth flow: Argon2id, timing-safe dummy hash, rate limiting - all intact.
- SQL injection: all queries use parameterized values via Drizzle - verified.
- LIKE patterns: properly escaped with `escapeLikePattern()` - verified.
- HTML sanitization: DOMPurify with appropriate allowlists - verified.
- JSON-LD: `safeJsonForScript` escapes `</script` sequences - verified.
