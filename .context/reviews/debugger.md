# Debugger Review — RPF Cycle 14

**Date:** 2026-04-22
**Reviewer:** debugger
**Base commit:** 023ae5d4

## Previously Fixed Items (Verified)

All cycle 13 debugger findings are fixed:
- DBG-1 (chat-logs-client.tsx missing res.ok check): Fixed
- DBG-2 (recruiter-candidates-panel.tsx unguarded res.json()): Fixed
- DBG-3 (quick-create-contest-form.tsx unguarded res.json()): Fixed
- DBG-4 (workers-client.tsx icon-only buttons): Fixed

## Findings

### DBG-1: `create-problem-form.tsx` double `res.json()` — body consumed on first read [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:332,336` and `423,427`

**Description:** The code calls `await res.json()` twice on the same response object. The Response body can only be consumed once. Currently, the first call is on the error path (with `.catch()`), and the error path always throws before the second call is reached. However, this is a latent bug — if someone refactors the error path to not throw, the second `.json()` call would fail with "body already consumed".

**Concrete failure scenario:** Developer removes the `throw new Error(...)` on line 333-334 to add a fallback. Line 336 `await res.json()` throws "body already consumed" because line 332 already read the body.

**Fix:** Parse the response once and branch on `res.ok`:
```ts
const data = await res.json().catch(() => ({}));
if (!res.ok) throw new Error(...);
// use data for success
```

**Confidence:** HIGH

---

### DBG-2: `problem-export-button.tsx` — `data.data.problem.title` access without null check [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/[id]/problem-export-button.tsx:19-24`

**Description:** After `await res.json()` on line 19, the code accesses `data.data.problem.title` on line 24 without any null check. If the API returns a 200 with `{ data: {} }` (missing `problem`), this throws TypeError: `Cannot read properties of undefined (reading 'title')`.

**Concrete failure scenario:** API bug returns `{"data": {"id": "123"}}` without `problem`. Line 24 crashes with TypeError. The outer catch shows "exportFailed" toast with no detail.

**Fix:** Add null-safe access: `data?.data?.problem?.title ?? "problem"`.

**Confidence:** MEDIUM

---

### DBG-3: `contest-join-client.tsx:45,49` variable shadowing — `payload` declared twice [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:45,49`

**Description:** `const payload` is declared on line 45 in the error block and again on line 49 in the success block. While this works because the error block throws before line 49, the shadowing is a code smell that could lead to confusion.

**Fix:** Rename the error-path variable to `errorPayload`.

**Confidence:** LOW

---

### DBG-4: `problem-import-button.tsx` — no file size validation before `file.text()` [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/problem-import-button.tsx:22`

**Description:** Carried from cycle 13. No file size check before loading the entire file into memory with `file.text()`. A large file would cause the browser tab to freeze or crash with an out-of-memory error.

**Concrete failure scenario:** User selects a 500MB JSON file (accidentally or maliciously). `file.text()` tries to load 500MB into memory. Browser tab becomes unresponsive or crashes.

**Fix:** Add `if (file.size > 10 * 1024 * 1024) { toast.error(t("fileTooLarge")); return; }` before `file.text()`.

**Confidence:** HIGH

---

## Final Sweep

The cycle 13 fixes are properly implemented. The most notable new finding this cycle is the double `res.json()` in create-problem-form.tsx — a latent bug that could become active with future refactoring. The file size validation issue for problem import is carried from cycle 13.
