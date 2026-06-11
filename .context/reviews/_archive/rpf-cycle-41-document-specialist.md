# Document Specialist Review — Cycle 41

**Date:** 2026-04-23
**Reviewer:** document-specialist
**Base commit:** 24a04687

## DOC-1: PATCH route comment says "Revoked invitations cannot be un-revoked" but `allowed` map only has `pending` key [LOW/LOW]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:98-102`

**Description:** The comment on line 98-102 explains why revoked invitations cannot be un-revoked. This is correct — the `allowed` map only has a `pending` key. However, the `allowed` map on line 97 still includes `"redeemed"` as a valid transition from `"pending"`, which contradicts the comment's spirit of restricting transitions to only those that are safe. The `"redeemed"` entry is misleading documentation.

**Fix:** Remove `"redeemed"` from the `allowed` map to make the code self-documenting. The comment is accurate but the data structure it describes is not.

**Confidence:** Low (documentation mismatch; no functional impact)

---

## Previously Flagged Items Still Present

- SSE route ADR — previously deferred
- Docker client dual-path docs — previously deferred
