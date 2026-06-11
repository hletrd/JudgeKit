# Cycle 45 — Code Reviewer

**Date:** 2026-04-23
**Base commit:** d96a984f

## Findings

### CR-1: Non-null assertion on Map.get() in student page [MEDIUM/LOW]

**File:** `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/student/[userId]/page.tsx:131`

```typescript
submissionsByProblem.get(sub.problemId)!.push(sub);
```

The `!` non-null assertion is used after a `has()` check on the preceding lines (128-130), so the code is technically safe at runtime. However, this is the same `Map.get()!` pattern that was fixed in cycles 43-44 across `contest-scoring.ts`, `submissions.ts`, and `contest-analytics.ts`. The codebase has converged on explicit null guards. This is the last remaining instance in the server-side assignment module tree.

**Fix:** Replace with explicit null guard:
```typescript
const entry = submissionsByProblem.get(sub.problemId);
if (entry) {
  entry.push(sub);
} else {
  submissionsByProblem.set(sub.problemId, [sub]);
}
```
Or simplify by always setting and getting:
```typescript
const entry = submissionsByProblem.get(sub.problemId);
if (!entry) {
  const arr = [sub];
  submissionsByProblem.set(sub.problemId, arr);
} else {
  entry.push(sub);
}
```

---

### CR-2: Non-null assertion on `problem!.id` in submission detail client [MEDIUM/LOW]

**File:** `src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx:85`

```typescript
const key = `oj:submission-draft:${props.userId}:${submission.problem!.id}`;
```

The `submission.problem` is populated by a Drizzle relational query (`with: { problem: ... }`), so it should always be present. However, using a non-null assertion here is inconsistent with the codebase pattern that was established in recent cycles (removing non-null assertions). If the relational join ever fails (e.g., problem deleted after submission), this would throw a runtime error instead of gracefully degrading.

**Fix:** Use optional chaining with a fallback:
```typescript
const key = `oj:submission-draft:${props.userId}:${submission.problem?.id ?? "unknown"}`;
```

---

### CR-3: Non-null assertions in contest page deadline computation [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/contests/page.tsx:214`

```typescript
deadline={(contest.personalDeadline ?? contest.deadline) instanceof Date
  ? (contest.personalDeadline ?? contest.deadline)!.getTime()
  : new Date((contest.personalDeadline ?? contest.deadline)!).getTime()}
```

The `!` assertions here are on the result of `(contest.personalDeadline ?? contest.deadline)` which is already checked to be truthy by the surrounding conditional logic (`status === "open" || status === "in_progress"` combined with `(contest.personalDeadline ?? contest.deadline)` being present). However, the code repeats the nullish coalescing expression three times and uses `!` in two of them. This is a code quality / maintainability issue rather than a bug.

**Fix:** Extract to a local variable:
```typescript
const deadline = contest.personalDeadline ?? contest.deadline;
// then use deadline without ! since the parent condition already checks it
```

---

### CR-4: Non-null assertion on `problemSet!.id` in problem-set form [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/problem-sets/_components/problem-set-form.tsx:200`

```typescript
? `/api/v1/problem-sets/${problemSet!.id}`
```

This is inside a conditional that checks `problemSet` is not null/undefined, so the `!` is safe. Same pattern as above — cosmetic consistency with the codebase convention.

**Fix:** Use optional chaining: `problemSet?.id` with a fallback.

---

### CR-5: Non-null assertion on `role!.id` in role editor dialog [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/admin/roles/role-editor-dialog.tsx:76`

```typescript
: `/api/v1/admin/roles/${role!.id}`;
```

Same pattern — inside a conditional branch that already confirms `role` is not null.

**Fix:** Use optional chaining or extract to a local variable.

---

## Summary

| ID | Severity/Confidence | Description |
|----|----|----|
| CR-1 | MEDIUM/LOW | Non-null assertion on Map.get() in student page |
| CR-2 | MEDIUM/LOW | Non-null assertion on problem!.id in submission detail |
| CR-3 | LOW/LOW | Non-null assertions in contest page deadline computation |
| CR-4 | LOW/LOW | Non-null assertion on problemSet!.id |
| CR-5 | LOW/LOW | Non-null assertion on role!.id |

All findings are consistency/maintainability issues following the pattern established in cycles 43-44 where non-null assertions were removed from server-side code. The two MEDIUM findings are in user-facing code that could throw if invariants are violated.
