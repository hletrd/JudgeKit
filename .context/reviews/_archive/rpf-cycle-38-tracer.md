# Tracer Review — RPF Cycle 38

**Date:** 2026-04-23
**Reviewer:** tracer
**Base commit:** 4dd3d951

## Inventory of Files Reviewed

- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/` — Full invitation flow traced
- `src/app/api/v1/contests/quick-create/route.ts` — Quick-create flow traced
- `src/app/api/v1/admin/api-keys/` — API key lifecycle traced
- `src/lib/assignments/recruiting-invitations.ts` — Core invitation logic traced

## Causal Traces

### TRACE-1: Bulk invitation email dedup — case sensitivity bypass

**Flow:**
1. Client sends POST with `invitations: [{ candidateEmail: "Alice@Example.COM" }]`
2. Route normalizes to lowercase: `emails = ["alice@example.com"]` (line 21-22)
3. `uniqueEmails` check passes (line 24) — no intra-request duplicates
4. DB query: `inArray(recruitingInvitations.candidateEmail, ["alice@example.com"])` (line 47)
5. DB column stores `"Alice@Example.COM"` (from prior single-create)
6. PostgreSQL `IN` is case-sensitive by default → no match found
7. Existing invitation not detected → duplicate created

**Competing hypothesis:** Perhaps the DB has a case-insensitive collation? Unlikely — PostgreSQL uses case-sensitive `text` comparisons by default, and the single route's use of `lower()` confirms the developers expect case-sensitive behavior.

**Conclusion:** Confirms CR-1/SEC-1 — the bulk route has a case-sensitivity bug in the email dedup check.

**Confidence:** High

---

### TRACE-2: Quick-create group ownership — orphan scenario

**Flow:**
1. Instructor calls quick-create → group created with `instructorId: user.id`
2. Assignment created with `groupId`
3. If contest (assignment) is later deleted, the group remains
4. Group appears in instructor's group list with no way to distinguish it as a quick-create artifact

**Conclusion:** This is a design concern (CRI-2), not a data loss or correctness bug.

**Confidence:** Low
