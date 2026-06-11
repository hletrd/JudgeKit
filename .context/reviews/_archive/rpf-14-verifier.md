# RPF Cycle 14 - Verifier

**Date:** 2026-04-20
**Base commit:** c39ded3b

## Findings

### VER-1: API key and invitation creation timestamps are not verified against DB time [MEDIUM/HIGH]

**Files:**
- `src/app/api/v1/admin/api-keys/route.ts:81`
- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts`

**Description:** Verified by tracing the data flow: client computes `expiresAt` using `new Date(Date.now() + days * 86400000)` -> sends as ISO string in request body -> server schema validates it's a valid datetime format -> server stores it directly. No step in this pipeline validates the timestamp against DB server time. The `isExpired` SQL expression (`CASE WHEN expiresAt < NOW()`) will use DB time for comparison, but the stored value itself was computed against browser time.

**Evidence:** Traced `api-keys-client.tsx:162` -> `api-keys/route.ts:15` (schema) -> `api-keys/route.ts:81` (storage). No `getDbNowUncached()` call in the POST handler.

**Fix:** Accept `expiryDays`, compute `expiresAt` server-side using `getDbNowUncached()`.

**Confidence:** High

### VER-2: Prior cycle fixes verified as correctly implemented [VERIFIED]

- AGG-1 (rpf-13): `isExpired` computed server-side in SQL for both API keys and recruiting invitations - VERIFIED.
- AGG-2 (rpf-13): `createBackupIntegrityManifest` requires `dbNow` parameter - VERIFIED.
- AGG-3 (rpf-13): Backup download extracts filename from `Content-Disposition` header - VERIFIED.
- AGG-4 (rpf-13): "Loading..." text uses `tCommon("loading")` - VERIFIED.
- AGG-5 (rpf-13): `dbNow` passed through backup pipeline - VERIFIED.

### VER-3: `withUpdatedAt()` callers that don't pass `now` - verified count [MEDIUM/MEDIUM]

**File:** `src/lib/db/helpers.ts:20`

**Description:** Verified that 9 of 11 callers don't pass `now`, using `new Date()` fallback:
1. `src/app/api/v1/users/[id]/route.ts:362`
2. `src/app/api/v1/users/[id]/route.ts:478` (uses `getDbNowUncached()` but only for `tokenInvalidatedAt`, not passed to `withUpdatedAt`)
3. `src/app/api/v1/groups/[id]/route.ts:144`
4. `src/app/api/v1/admin/roles/[id]/route.ts:99`
5. `src/app/api/v1/admin/plugins/[id]/route.ts:75`
6. `src/app/api/v1/admin/plugins/[id]/route.ts:106`
7. `src/lib/actions/plugins.ts:123`
8. `src/lib/actions/update-profile.ts:96`
9. `src/lib/actions/update-preferences.ts:104`

Wait - re-checking line 478: it uses `withUpdatedAt({ isActive: false, tokenInvalidatedAt: await getDbNowUncached() })`. Here `getDbNowUncached()` is used for the `tokenInvalidatedAt` field value but NOT passed as the `now` parameter to `withUpdatedAt`. So `updatedAt` still gets `new Date()` while `tokenInvalidatedAt` gets DB time, creating an inconsistency within the same row update.

**Confidence:** High
