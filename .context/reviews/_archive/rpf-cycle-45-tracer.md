# Cycle 45 — Tracer

**Date:** 2026-04-23
**Base commit:** d96a984f

## Causal Traces

### TR-1: Non-null assertion on `submission.problem!.id` — what if the problem is deleted? [MEDIUM/LOW]

**File:** `src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx:85`

**Trace:**
1. User submits code to a problem — submission record created with `problemId`
2. Instructor deletes the problem — `problems` row deleted, but `submissions` row still references it
3. User clicks "resubmit" on the submission detail page
4. `handleResubmit()` executes: `submission.problem!.id` throws `TypeError: Cannot read properties of null`
5. The resubmit button silently fails — no error feedback to the user

**Hypothesis 1 (confirmed):** The Drizzle query in the parent page component uses `with: { problem: ... }` which is a LEFT JOIN. If the problem is deleted, `submission.problem` is null, and the `!` assertion throws.

**Hypothesis 2 (unlikely):** The Drizzle ORM always populates relations. This is false — if the foreign key reference is deleted, the relation will be null.

**Fix:** Replace `submission.problem!.id` with `submission.problem?.id` and guard the `handleResubmit` function.

---

### TR-2: Contest page deadline computation with non-null assertion — what if both deadlines are null? [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/contests/page.tsx:209-215`

**Trace:**
1. A contest has `status === "open"` or `status === "in_progress"`
2. The condition `(contest.personalDeadline ?? contest.deadline)` evaluates to a truthy value
3. The code accesses `(...).getTime()` with a `!` assertion
4. This is safe because the parent condition at line 209 checks `(contest.personalDeadline ?? contest.deadline)` is present

**Conclusion:** Safe but fragile. If someone changes the parent condition, the `!` could become a bug.

---

## Summary

| ID | Severity/Confidence | Description |
|----|----|----|
| TR-1 | MEDIUM/LOW | submission.problem!.id throws if problem is deleted |
| TR-2 | LOW/LOW | Contest deadline non-null assertion is safe but fragile |
