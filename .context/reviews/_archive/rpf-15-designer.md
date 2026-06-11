# RPF Cycle 15 — Designer

**Date:** 2026-04-20
**Base commit:** f0bef9cb

## Findings

### DES-1: Recruiting invitations custom date picker lacks timezone hint [LOW/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:381-388`

The custom expiry date picker (`<Input type="date">`) shows a bare date input with no indication that the selected date will be interpreted as end-of-day UTC. An admin in UTC+9 selecting "April 30" might expect the invitation to expire at 23:59:59 JST (14:59:59 UTC), but the server computes `2026-04-30T23:59:59Z` — 9 hours later than expected in their local time.

The rpf-14 fix (M1) resolved the *technical* timezone issue by moving computation server-side with explicit UTC. But the UX still lacks a hint about what timezone will be used.

**Fix:** Add a small helper text below the date picker: e.g., `{t("expiryDateUtcHint")}` → "Expires at end of day (UTC)".

**Confidence:** MEDIUM

### DES-2: No loading/empty state for recruiting invitations stats cards [LOW/LOW]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:306-314`

The stats cards (`total`, `pending`, `redeemed`, `revoked`, `expired`) render immediately with `stats[key]` values. When the component first mounts, `stats` initializes to `{ total: 0, pending: 0, redeemed: 0, revoked: 0, expired: 0 }`, showing all zeros before data loads. A skeleton or loading indicator would be more informative.

**Fix:** Show a loading state for stats while `loading` is true, or delay rendering stats until data is fetched.

**Confidence:** LOW

## Verified Safe

- Korean letter-spacing correctly handled across all components — verified.
- `tracking-tight` and `tracking-wide` conditioned on `locale !== "ko"` — verified.
- Mobile menu shows "DASHBOARD" heading with conditional `tracking-wide` — verified.
- PublicHeader has proper focus management (Escape to close, focus trap) — verified.
- Skip-to-content link present in both layouts — verified.
- ARIA attributes on navigation elements — verified.
