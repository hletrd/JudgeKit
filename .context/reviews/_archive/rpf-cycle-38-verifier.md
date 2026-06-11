# Verifier Review — RPF Cycle 38

**Date:** 2026-04-23
**Reviewer:** verifier
**Base commit:** 4dd3d951

## Inventory of Files Reviewed

- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/` — Verified all invitation routes for consistency
- `src/app/api/v1/admin/api-keys/` — Verified API key creation/update flows
- `src/app/api/v1/contests/quick-create/route.ts` — Verified NaN guards
- `src/lib/assignments/recruiting-constants.ts` — Verified constant extraction
- `src/lib/plugins/chat-widget/chat-widget.tsx` — Verified accessibility
- `src/lib/realtime/realtime-coordination.ts` — Verified ESCAPE clauses
- `src/lib/security/password-hash.ts` — Verified rehash consolidation

## Verification Results

### Previously Fixed Items — All Verified

1. **Quick-create NaN guard (AGG-1 from cycle 37):** VERIFIED. Lines 36-37 and 42-43 add `Number.isFinite()` checks after Date construction.
2. **MAX_EXPIRY_MS extraction (AGG-2 from cycle 37):** VERIFIED. Constant is in `recruiting-constants.ts` and imported in all 3 invitation routes.
3. **SSE ESCAPE clauses (AGG-3 from cycle 37):** VERIFIED. Lines 94, 102, 107 all include `ESCAPE '\\'`.
4. **Chat widget aria-label (AGG-4 from cycle 37):** VERIFIED. Line 281 includes message count in aria-label.
5. **Password rehash consolidation (cycle 37 fix):** VERIFIED. `backup/route.ts:63` and `export/route.ts:57` both use `verifyAndRehashPassword`.
6. **LIKE pattern escaping (cycle 37 fix):** VERIFIED. `audit-logs/page.tsx:150` uses `escapeLikePattern(groupId)`.

## New Findings

### V-1: Bulk invitation email duplicate check is case-sensitive — confirms CR-1/SEC-1 [MEDIUM/HIGH]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:41-49`

**Description:** Verified by tracing the code flow:
1. Line 20-23: Emails are lowercased for client-side dedup (`body.invitations.map((inv) => inv.candidateEmail?.toLowerCase())`)
2. Line 33: `orderedEmails` contains lowercased values
3. Line 41-49: `inArray(recruitingInvitations.candidateEmail, orderedEmails)` — this compares lowercase strings against the raw `candidateEmail` column, which is case-sensitive in PostgreSQL by default

The single-create route at line 57 uses `sql\`lower(${recruitingInvitations.candidateEmail}) = ${normalizedEmail}\`` — case-insensitive. The inconsistency is confirmed.

**Fix:** Use `lower()` comparison in the bulk route.

**Confidence:** High — verified by tracing the code path end-to-end

---

### V-2: Quick-create route correctly validates problemIds existence but does not check assignment visibility [LOW/LOW]

**File:** `src/app/api/v1/contests/quick-create/route.ts:51-57`

**Description:** The route checks that all `problemIds` exist in the database, but does not verify that the current user has access to those problems. An instructor could potentially include problems they don't have access to in a quick-created contest. However, since the user already has `contests.create` capability (checked by the handler), this is a minor authorization concern rather than a security bug.

**Confidence:** Low — capability check may be sufficient
