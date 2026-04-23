# RPF Cycle 14 - Debugger

**Date:** 2026-04-20
**Base commit:** c39ded3b

## Findings

### DBG-1: API key expiresAt stored from client time - latent data corruption bug [MEDIUM/HIGH]

**File:** `src/app/api/v1/admin/api-keys/route.ts:81`

**Description:** When an API key is created, the `expiresAt` value comes from the client's `Date.now()`. The `isExpired` check in the GET endpoint uses `NOW()` (DB time). If there's clock skew, the key will expire at a time that doesn't match the admin's intent. This is a data corruption bug that persists silently in the database.

**Failure scenario:**
1. Admin creates a key with "30d" expiry at browser time 12:00.
2. DB server time is 12:05 (5 minutes ahead).
3. Client sends `expiresAt = 12:00 + 30d`.
4. Server stores this value.
5. The key will be considered expired 5 minutes *before* the admin expected.
6. The `isExpired` badge will correctly show "Expired" at the wrong time, making the bug invisible.

**Fix:** Accept `expiryDays`, compute `expiresAt` server-side.

**Confidence:** High

### DBG-2: `useEffect` cleanup with `[t]` dependency causes timer state leak [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:98-105`

**Description:** The cleanup `useEffect` for copy-feedback timers depends on `[t]`. When the locale changes, the effect re-runs, clearing timers. But since `setCopied(false)` / `setCopiedKeyId(null)` is only called by the timer callback, clearing the timer without also resetting the state means the "Copied" indicator persists indefinitely after a locale change.

**Failure scenario:**
1. User clicks "Copy" - `copied` becomes `true`, timer set for 2s.
2. Locale changes before 2s (e.g., via language switcher).
3. Timer is cleared but `copied` is still `true`.
4. "Copied" indicator stays forever until next copy action.

**Fix:** Change dependency to `[]`, or add state reset in the cleanup.

**Confidence:** High

### DBG-3: Recruiting invitation custom expiry date uses browser timezone [LOW/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:138`

**Code:** `expiresAt = new Date(customExpiryDate + "T23:59:59").toISOString();`

**Description:** The custom expiry date is constructed by appending "T23:59:59" to the date input value, then converting to ISO. The `new Date()` constructor interprets this in the browser's local timezone, producing a UTC timestamp that depends on the user's timezone offset. An admin in UTC+9 and an admin in UTC-5 would get different `expiresAt` values for the same calendar date selection.

**Fix:** Either use UTC explicitly (`"T23:59:59Z"`) or have the server compute the end-of-day timestamp.

**Confidence:** High
