# Verifier Review — Cycle 12 (HEAD: ecfa0b6c)

**Date:** 2026-05-11
**Reviewer:** verifier
**Scope:** Evidence-based correctness check against stated behavior

---

## Findings

### C12-VER-1: apiFetch contract violation — cleanup not guaranteed
**Severity:** MEDIUM | **Confidence:** High
**File:** `src/lib/api/client.ts:90-98`

**Claim:** The apiFetch documentation states it supports "`signal` for AbortController-based cancellation" and the code uses `withTimeout` + `cleanupWithTimeout` for cleanup.

**Evidence:** Lines 91-94 show the cleanup pattern for the `init.signal` branch. Lines 97-98 show NO cleanup for the default branch.

**Conclusion:** The implementation violates its own contract. Cleanup is not guaranteed — it only happens when a signal is provided. This is incorrect.

**Fix:** Add cleanup to line 98.

---

### C12-VER-2: normalizeSubmission claims runtime narrowing but retains casts
**Severity:** LOW | **Confidence:** High
**File:** `src/hooks/use-submission-polling.ts:45-119`

**Claim:** Cycle 11 commit (954efe82) claims "replace unsafe as casts with runtime narrowing in submission polling".

**Evidence:** Running `grep -n "as " src/hooks/use-submission-polling.ts` shows 8 instances of `as` casts remaining at lines 48, 50, 52, 75, 77, 79, 82, 257.

**Conclusion:** The claim is overstated. The fix was partial.

**Fix:** Complete the removal of `as` casts in this file.

---

## Verified Prior Fixes

All cycle 11 fixes verified intact at HEAD ecfa0b6c:
- CountdownTimer `staggeredTimerIdsRef` removed
- `use-submission-polling.ts` AbortController added to polling
- `events.ts` `flushAuditBuffer` accepts optional `dbNow`
