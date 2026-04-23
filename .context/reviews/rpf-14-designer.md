# RPF Cycle 14 - Designer

**Date:** 2026-04-20
**Base commit:** c39ded3b

## Findings

### DES-1: Recruiting invitation custom date input has no timezone indication [LOW/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:378-384`

**Description:** The custom expiry date input (`<Input type="date">`) allows selecting a date, and the code appends "T23:59:59" to create an end-of-day timestamp. However, there is no indication to the user of which timezone this end-of-day refers to. An admin in Korea (UTC+9) selecting "April 30" would get a different `expiresAt` than an admin in the US (UTC-5) selecting the same date, with no UI feedback about this difference.

**Fix:** Display the resolved UTC timestamp after selection, or explicitly state "End of day in your local time" near the date input. Better yet, compute the timestamp server-side and show the result.

**Confidence:** High

### DES-2: API key creation has no expiry preview [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:381-395`

**Description:** When creating an API key with an expiry duration (30d, 90d, 1y), the UI shows the duration label but not the computed expiry date. Users cannot verify when the key will actually expire before creating it.

**Fix:** Show a preview of the computed expiry date below the dropdown, e.g., "Expires: June 20, 2026". After fixing SEC-1, this would be a server-computed value.

**Confidence:** Low

### DES-3: Copy feedback timer may persist indefinitely on locale change [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:98-105`

**Description:** The `useEffect` cleanup for copy-feedback timers depends on `[t]` (locale). When locale changes, timers are cleared but state (`copiedKeyId`) is not reset. This means the green checkmark indicator persists after a language switch, which is a minor UX inconsistency.

**Fix:** Reset copy feedback state in the cleanup, or change dependency to `[]`.

**Confidence:** High

## Verified Safe

- Korean letter-spacing: correctly uses conditional `locale !== "ko"` check - verified.
- Date formatting: uses `formatDateTimeInTimeZone` with resolved system timezone - verified.
- i18n: all user-facing text uses translation keys - verified (prior hardcoded "Loading..." fixed).
