# Debugger Review — RPF Cycle 15

**Date:** 2026-04-22
**Reviewer:** debugger
**Base commit:** 6c07a08d

## Previously Fixed Items (Verified)

All cycle 14 debugger findings are fixed:
- DBG-1 (double `res.json()` in create-problem-form): Fixed
- DBG-2 (problem-export-button null-safety): Fixed
- DBG-3 (contest-join-client variable shadowing): Fixed
- DBG-4 (problem-import-button file size validation): Fixed

## Findings

### DBG-1: `recruiting-invitations-panel.tsx` — `fetchInvitations` unguarded `res.json()` can throw SyntaxError on success path [MEDIUM/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:137`

**Description:** Inside `if (invRes.ok)`, line 137 calls `await invRes.json()` without `.catch()`. If the server returns a 200 with a non-JSON body (e.g., proxy misconfiguration), this throws SyntaxError. The outer catch on line 140 shows `t("fetchError")` toast, which is correct but provides no diagnostic detail about the parse failure.

**Concrete failure scenario:** A CDN or reverse proxy returns 200 with an HTML error page. `invRes.json()` throws SyntaxError. The catch block shows "fetchError" toast. The user refreshes and sees the same error. There is no indication that the issue is a malformed response.

**Fix:** Add `.catch(() => ({ data: [] }))` or use `apiFetchJson`.

**Confidence:** HIGH

---

### DBG-2: `workers-client.tsx` — `fetchData` unguarded `res.json()` can throw SyntaxError [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:235,241`

**Description:** Same class of issue as DBG-1. Both `workersRes.json()` and `statsRes.json()` are called without `.catch()` inside `if (res.ok)` blocks. A non-JSON 200 response would throw SyntaxError.

**Fix:** Add `.catch()` guards or use `apiFetchJson`.

**Confidence:** HIGH

---

### DBG-3: `recruiting-invitations-panel.tsx` metadata remove button missing `aria-label` [LOW/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:479-485`

**Description:** Icon-only button without `aria-label`. This is the same class of issue fixed in cycles 11-13.

**Fix:** Add `aria-label`.

**Confidence:** HIGH

---

## Final Sweep

The cycle 14 fixes are properly implemented. The remaining issues are the 4 unguarded `.json()` calls in 2 files that were missed by the `apiFetchJson` refactor. These are the same class of latent bug that has been identified in prior cycles. The accessibility issue with the metadata remove button is a minor regression.
