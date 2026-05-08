# Code Review — Cycle 14/100

**Reviewer:** code-reviewer (manual)
**Date:** 2026-05-08
**HEAD:** fe8f8866
**Scope:** Full TypeScript/TSX source review, focusing on timer correctness, abort controller hygiene, and test coverage gaps

---

## NEW FINDINGS

### C14-CR-1 — Shared AbortController causes cross-operation cancellation in language admin [MEDIUM]
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:87,150-177,183-207,214-224`
- **Problem:** The component declares a single `abortControllerRef` (line 87) that is shared between `handleBuild`, `confirmRemoveImage`, and `confirmPrune`. When any of these operations starts, it aborts the previous request regardless of whether it was the same type of operation. For example, if a Docker image build for `judge-python` is in flight and the admin clicks "Remove" on `judge-rust`, the build request is aborted. This is unexpected UX — operations on different languages should not interfere with each other.
- **Fix:** Use separate AbortController refs for each operation type (build, remove, prune), or key the controller by language/operation so they don't collide.

### C14-CR-2 — CopyCodeButton timer leak on rapid clicks [LOW]
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/components/code/copy-code-button.tsx:13,19-27`
- **Problem:** `handleCopy` sets `copiedTimer.current = setTimeout(...)` without first clearing any existing timer. If the user clicks the copy button twice within 2 seconds, the first timer remains in the event queue. When it fires, it sets `copied = false` even though the second timer is still running. This causes the "copied" checkmark to disappear prematurely.
- **Fix:** Clear `copiedTimer.current` before setting a new timeout, matching the pattern in `api-keys-client.tsx` and `file-management-client.tsx`.

## Previously Fixed (Verified at HEAD)

| ID | Status | Note |
|---|---|---|
| C13-CR-1 (AbortController in 4 files) | FIXED | Commits e9df1dc1, a7c12a9e, b91121bf add AbortController cleanup |
| C13-CR-2 (AcceptedSolutions concurrent fetch) | FIXED | Commit a7c12a9e aborts previous fetch on filter change |
| C12-CR-1 through C12-CR-3 | FIXED | All verified |

## Carry-forward Deferred Items (NOT re-reported)

- C12b-1 through C12b-3: deferred per cycle 13 aggregate
