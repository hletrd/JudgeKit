# Document Specialist Review — RPF Cycle 36

**Date:** 2026-04-23
**Reviewer:** document-specialist
**Base commit:** 601ff71a

## Inventory of Files Reviewed

- JSDoc comments across API routes
- README.md
- CLAUDE.md
- AGENTS.md
- Inline documentation

## Findings

### DOC-1: PATCH invitation route lacks JSDoc for expiryDate validation — consistent with POST routes [LOW/LOW]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts`

**Description:** The PATCH route has no JSDoc explaining the `expiryDate` validation logic. The POST single and bulk routes have inline comments explaining the YYYY-MM-DD format expectation and the NaN guard. The PATCH route has a comment about "Compute expiresAt server-side" but no comment about the NaN guard (which is also missing, see CR-1).

**Fix:** Add NaN guard (code fix) and add inline comment explaining the defense-in-depth check, consistent with the POST routes.

**Confidence:** High

---

### DOC-2: Import route dual-path deprecation not documented in README [LOW/LOW — carry-over]

**File:** `src/app/api/v1/admin/migrate/import/route.ts`

**Description:** The JSON body deprecation is logged via `logger.warn` and has Sunset headers, but the README doesn't mention the deprecation timeline. Carry-over from DOC-1 in cycle 35.

**Confidence:** Low
