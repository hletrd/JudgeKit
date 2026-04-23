# Critic Review — RPF Cycle 14

**Date:** 2026-04-22
**Reviewer:** critic
**Base commit:** 023ae5d4

## Previously Fixed Items (Verified)

All cycle 13 critic findings are fixed:
- CRI-1 (workers-client.tsx icon-only buttons): Fixed — all six buttons now have `aria-label`
- CRI-2 (inconsistent res.json() error handling — chat-logs): Fixed — `res.ok` check and `.catch()` added
- CRI-3 (group-instructors-manager.tsx remove button): Fixed — `aria-label` added

## Findings

### CRI-1: Systemic unguarded `res.json()` pattern — three cycles of partial fixes without systematic resolution [MEDIUM/HIGH]

**Files:** See CR-1 in code-reviewer.md for full list (11+ components)

**Description:** This is the fourth cycle where unguarded `res.json()` calls are being identified. Cycle 11 found the pattern, cycle 12 fixed some, cycle 13 fixed more, and cycle 14 still finds 11+ components with the same issue. The piecemeal approach is not working. The codebase needs a systematic solution — either a centralized `apiFetchJson` helper or a linter rule that enforces `.catch()` on `res.json()` calls.

The fact that this keeps recurring as new findings in each cycle suggests the root cause — lack of a codified pattern — has not been addressed. Individual fixes keep being made but new instances appear in each review.

**Fix:** Create a centralized `apiFetchJson<T>(res: Response, fallback: T): Promise<T>` helper that handles `.json()` + `.catch()` in one call. Refactor all `res.json()` calls to use it. This would also make the code more DRY.

**Confidence:** HIGH

---

### CRI-2: `create-problem-form.tsx` consumes response body twice with `res.json()` [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:332,336` and `423,427`

**Description:** The code calls `await res.json()` on the error path (with `.catch()`), then calls `await res.json()` again on the success path. The first call consumes the response body. If the error path doesn't throw, the second call would fail with "body already consumed". This is a latent bug — currently the error path always throws, so the second `.json()` is reached only on success. But the dual-read pattern is fragile and could break with future refactoring.

**Fix:** Parse the response once and branch based on `res.ok`:
```ts
const data = await res.json().catch(() => ({}));
if (!res.ok) throw new Error(...);
// use data for success
```

**Confidence:** HIGH

---

### CRI-3: `contest-join-client.tsx` variable shadowing — `payload` declared twice in same scope [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:45,49`

**Description:** `const payload` is declared on line 45 (error path) and again on line 49 (success path). The error path throws, so there's no runtime issue, but the shadowing is confusing and violates clean code principles.

**Fix:** Rename the error-path variable to `errorPayload`.

**Confidence:** MEDIUM

---

### CRI-4: `problem-export-button.tsx` — no null-safety on nested property access after `res.json()` [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/[id]/problem-export-button.tsx:19-24`

**Description:** After calling `res.json()` on line 19, the code accesses `data.data.problem.title` on line 24 without any null checks. If the API returns a valid 200 with an unexpected shape (e.g., missing `problem` field), this throws a TypeError that gets caught by the generic catch, showing "exportFailed" with no diagnostic detail.

**Fix:** Add null-safe access: `data?.data?.problem?.title ?? "problem"` and validate before proceeding.

**Confidence:** MEDIUM

---

## Final Sweep

The cycle 13 fixes are properly implemented. The key systemic issue this cycle is the recurring unguarded `res.json()` pattern — four cycles of partial fixes without addressing the root cause. The double `res.json()` in create-problem-form.tsx is a latent bug worth fixing. Variable shadowing and missing null checks are lower priority but improve code quality.
