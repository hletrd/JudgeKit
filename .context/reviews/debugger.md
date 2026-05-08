# Debugger Review — Cycle 14/100

**Reviewer:** debugger (manual)
**Date:** 2026-05-08
**HEAD:** fe8f8866
**Scope:** Latent bug surface, timer leaks, race conditions, regressions

---

## NEW FINDINGS

### C14-DB-1 — CopyCodeButton timer accumulation on rapid clicks [LOW]
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/components/code/copy-code-button.tsx:26`
- **Problem:** Each click creates a new `setTimeout` without clearing the previous one. After N rapid clicks, N timers are queued. The first timer to fire resets `copied = false`, making the checkmark disappear before the intended 2-second duration from the most recent click. After unmount, only the last timer ID is cleared in cleanup — earlier timers leak and fire on an unmounted component (though React ignores the no-op state update).
- **Failure scenario:** User triple-clicks the copy button. The checkmark shows for ~2 seconds (first timer), then disappears. The user expects it to show for 2 seconds from the last click (~2 seconds total), but it actually disappears at ~2 seconds, then tries to disappear again at ~3 and ~4 seconds (no-op due to unmount or already-false state).
- **Fix:** Clear existing timer before setting new one.

### C14-DB-2 — Language admin cross-operation abort race [MEDIUM]
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:150-177,183-207`
- **Problem:** Build, remove, and prune operations share a single AbortController. If a slow build is in progress and the user clicks remove on another language, the build is aborted. The user sees a build error toast even though the build might have succeeded.
- **Fix:** Separate AbortControllers per operation.

## Regressions Checked

| Fix | Status |
|---|---|
| C13 AbortController fixes (4 files) | No regression — verified by inspection |
| C12 CountdownTimer deadline reactivity | No regression |
| C12 CountdownTimer staggered timer cleanup | No regression |
| C11 language-config-table abort on unmount | No regression |

## Summary

No regressions from prior fixes. Two new issues identified: a timer leak in CopyCodeButton and a cross-operation abort race in the language admin. Both are hygiene issues with concrete failure scenarios.
