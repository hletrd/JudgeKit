# RPF Cycle 13 — Designer

**Date:** 2026-04-20
**Reviewer:** designer

---

## DES-1: Recruiting invitations panel — expiry badge UX inconsistency [MEDIUM/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:248`
**Problem:** The "Expired" badge on recruiting invitations uses the browser's clock to determine expiry, while all other temporal logic in the system uses DB server time. This creates an inconsistent UX: an instructor with a misconfigured browser clock could see an invitation as "Pending" that is actually expired on the server, or vice versa. The correct information is available from the server (the `getInvitationStats` endpoint already computes expired counts using `NOW()`), but the per-row badge uses client-side time.
**Fix:** Add an `isExpired` boolean to the per-invitation API response, computed server-side. The badge should render based on this field.
**Confidence:** MEDIUM

## DES-2: Backup download filename mismatch [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:52`
**Problem:** The downloaded backup filename uses browser time, which may not match the DB-time-based snapshot inside. This is a minor UX issue for disaster recovery workflows.
**Fix:** Parse filename from server's `Content-Disposition` header.
**Confidence:** LOW

## DES-3: Loading state uses hardcoded English string [LOW/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:441`
**Code:** `<p className="text-sm text-muted-foreground">Loading...</p>`
**Problem:** The loading state text "Loading..." is hardcoded in English instead of using the i18n system. This is inconsistent with the rest of the component which uses `t()` for all other text.
**Fix:** Replace with `tCommon("loading")` or a dedicated translation key.
**Confidence:** MEDIUM

## DES-4: API keys table loading state uses hardcoded English string [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:407`
**Code:** `<p className="text-sm text-muted-foreground">Loading...</p>`
**Problem:** Same as DES-3. The loading state text "Loading..." is hardcoded in English.
**Fix:** Replace with translation key.
**Confidence:** MEDIUM

## Verified Safe

- Korean letter-spacing: CSS custom properties with `:lang(ko)` override — correct per project rules.
- Date formatting: uses `formatDateTimeInTimeZone()` with locale — correct.
- Client-side date formatting: uses `useLocale()` in all reviewed components.
- No custom `letter-spacing` applied to Korean text.
