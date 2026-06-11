# Document Specialist Review — RPF Cycle 38

**Date:** 2026-04-23
**Reviewer:** document-specialist
**Base commit:** 4dd3d951

## Inventory of Files Reviewed

- `src/lib/assignments/recruiting-constants.ts` — JSDoc accuracy
- `src/app/api/v1/contests/quick-create/route.ts` — Route documentation
- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/` — Route documentation
- `src/app/api/v1/admin/api-keys/` — Route documentation
- `src/lib/security/password-hash.ts` — JSDoc accuracy
- `src/lib/realtime/realtime-coordination.ts` — Module documentation

## Findings

### DOC-1: `recruiting-constants.ts` JSDoc says "~10 years" but actual value is exactly 10 years of 365.25-day years [LOW/LOW]

**File:** `src/lib/assignments/recruiting-constants.ts:7`

**Description:** The JSDoc says `/** Maximum expiry duration from creation time (~10 years). */` but the actual computation is `10 * 365.25 * 24 * 60 * 60 * 1000` which is exactly 10 tropical years (accounting for leap years). The tilde (~) implies an approximation, but the value is precise. A minor inaccuracy.

**Fix:** Change to `/** Maximum expiry duration from creation time (10 tropical years, accounting for leap days). */`

**Confidence:** Low

---

### DOC-2: Bulk invitation route lacks JSDoc describing the email dedup behavior [LOW/LOW]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts`

**Description:** The bulk invitation route has no JSDoc or inline documentation explaining how email deduplication works. The single-create route's `lower()` approach and the bulk route's `inArray()` approach behave differently (as discovered in CR-1), but this is not documented anywhere.

**Fix:** Add a comment explaining the dedup strategy, and after fixing CR-1, document that both routes use case-insensitive comparison.

**Confidence:** Low

---

## Previously Deferred Items (Still Present)

- SSE route ADR (deferred)
- Docker client dual-path behavior documentation (deferred)
