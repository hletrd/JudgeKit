# Tracer Review — RPF Cycle 14

**Date:** 2026-04-22
**Reviewer:** tracer
**Base commit:** 023ae5d4

## Previously Fixed Items (Verified)

All cycle 13 tracer findings are fixed:
- TR-1 (chat-logs-client.tsx missing res.ok check): Fixed
- TR-2 (workers-client.tsx icon-only buttons): Fixed
- TR-3 (recruiter-candidates-panel.tsx unguarded res.json()): Fixed

## Findings

### TR-1: `create-problem-form.tsx` — causal trace: double `res.json()` consumes response body [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:332,336` and `423,427`

**Description:** Causal trace of what happens if the error path is refactored to not throw:

1. User uploads an image on the problem create form
2. API returns 200 with valid JSON on line 332: `const data = await res.json().catch(() => ({}))`
3. Response body is now consumed
4. Code reaches line 336: `const { data } = await res.json()`
5. `res.json()` throws "body already consumed" TypeError
6. Outer catch shows "imageUploadError" toast
7. Image upload appears to fail even though the server succeeded

**Hypothesis 1 (confirmed):** The dual-read pattern is a latent bug. The error path's `throw` currently prevents the second read, but this is fragile.

**Alternative hypothesis (rejected):** The `.catch()` on line 332 prevents the body from being consumed. Rejected — `.catch()` only catches the parsing error, not the consumption.

**Fix:** Parse response once and branch on `res.ok`.

**Confidence:** HIGH

---

### TR-2: `problem-export-button.tsx` — causal trace: null dereference on unexpected API response shape [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/[id]/problem-export-button.tsx:19-24`

**Description:** Causal trace when the export API returns valid 200 but unexpected shape:

1. User clicks "Export Problem"
2. API returns 200 with `{"data": {"id": "123"}}` (missing `problem` field)
3. Line 19: `const data = await res.json()` — succeeds
4. Line 20: `const blob = new Blob([JSON.stringify(data.data, null, 2)])` — works (data.data exists)
5. Line 24: `data.data.problem.title` — `data.data.problem` is `undefined`
6. TypeError: "Cannot read properties of undefined (reading 'title')"
7. Outer catch shows "exportFailed" toast

**Fix:** Add null-safe access: `data?.data?.problem?.title ?? "problem"`.

**Confidence:** MEDIUM

---

### TR-3: `problem-import-button.tsx` — causal trace: oversized file crashes browser tab [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/problem-import-button.tsx:22-23`

**Description:** Carried from cycle 13. Causal trace when a user uploads a large file:

1. User selects a 500MB JSON file
2. Line 22: `const text = await file.text()` — starts reading 500MB into memory
3. Browser memory usage spikes
4. Tab becomes unresponsive or crashes with out-of-memory
5. No error is shown — the tab simply freezes

**Fix:** Add file size check before `file.text()`.

**Confidence:** HIGH

---

## Final Sweep

The cycle 13 fixes are properly implemented. The key new finding is the double `res.json()` latent bug in create-problem-form.tsx — a causal trace shows it would break if the error path were refactored. The file size validation issue is carried from cycle 13.
