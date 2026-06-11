# RPF Cycle 14 - Tracer

**Date:** 2026-04-20
**Base commit:** c39ded3b

## Findings

### TR-1: Causal trace: client-computed expiresAt stored to database [MEDIUM/HIGH]

**Trace path (API keys):**
1. `api-keys-client.tsx:162`: `expiresAt = new Date(Date.now() + days * 86400000).toISOString()` - uses browser time
2. `api-keys-client.tsx:171`: sends `{ name, role, expiresAt }` in POST body
3. `api-keys/route.ts:15`: schema validates `expiresAt: z.string().datetime().nullable().optional()` - only checks format
4. `api-keys/route.ts:81`: `expiresAt: body.expiresAt ? new Date(body.expiresAt) : null` - stores verbatim
5. `api-keys/route.ts:33` (GET): `CASE WHEN expiresAt < NOW()` - compares stored (browser-time) against DB time

**Hypothesis 1 (confirmed):** Clock skew between browser and DB causes stored `expiresAt` to be offset from DB time. The `isExpired` check uses `NOW()`, so the badge is "correct" relative to the stored (wrong) timestamp.

**Hypothesis 2 (alternative):** An attacker could send an arbitrary future `expiresAt` to create a key that never expires. The schema only validates datetime format, not value range.

**Fix:** Accept `expiryDays`, compute server-side.

**Confidence:** High

### TR-2: Causal trace: `withUpdatedAt()` time-source inconsistency [MEDIUM/MEDIUM]

**Trace path:**
1. `helpers.ts:20`: `withUpdatedAt(data, now?)` defaults `now` to `new Date()`
2. Callers like `users/[id]/route.ts:478` call `withUpdatedAt({ ..., tokenInvalidatedAt: await getDbNowUncached() })` but don't pass the DB time as `now`
3. Result: `tokenInvalidatedAt` uses DB time, `updatedAt` uses app-server time, in the same row update

**This is an especially clear demonstration of the bug:** two timestamp fields in the same `.set()` call use different time sources.

**Fix:** Make `now` required in `withUpdatedAt()`.

**Confidence:** High

### TR-3: Causal trace: recruiting invitation custom date timezone dependency [LOW/MEDIUM]

**Trace path:**
1. `recruiting-invitations-panel.tsx:138`: `new Date(customExpiryDate + "T23:59:59").toISOString()`
2. `new Date("2026-04-30T23:59:59")` is interpreted as local time (per ECMAScript spec for date-only + time strings without Z)
3. `.toISOString()` converts to UTC, producing different results depending on timezone
4. The server stores this UTC timestamp

**Hypothesis:** Admins in different timezones creating invitations with the same calendar date will store different `expiresAt` values. The difference equals their timezone offset.

**Fix:** Use UTC explicitly or compute server-side.

**Confidence:** High
