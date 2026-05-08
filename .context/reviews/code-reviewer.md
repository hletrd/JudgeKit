# Code Review — Cycle 16/100

**Reviewer:** code-reviewer (manual)
**Date:** 2026-05-08
**HEAD:** 5aef3f6f
**Scope:** Full TypeScript/TSX source review, focusing on ref safety, timer/RAF cleanup, and React patterns

---

## NEW FINDINGS

### C16-CR-1 — Callback ref non-null assertion in create-problem-form [LOW]
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/app/(public)/problems/create/create-problem-form.tsx:875,916`
- **Problem:** The callback refs for test-case file inputs use `el!` (non-null assertion):
  ```tsx
  ref={(el) => { testCaseInputFileRefs.current[index] = el!; }}
  ref={(el) => { testCaseOutputFileRefs.current[index] = el!; }}
  ```
  When React unmounts an element, it calls the ref callback with `null`. The `!` suppresses TypeScript's null check, meaning `null` is silently assigned to the array slot. While the current code accesses these refs with optional chaining (`?.click()`), the non-null assertion is a latent hazard: any future code that accesses the ref without null-checking will crash at runtime. Additionally, the `testCaseInputFileRefs.current` and `testCaseOutputFileRefs.current` arrays grow indefinitely and are never cleaned up when test cases are removed via `removeTestCase`, accumulating stale entries.
- **Fix:** Remove the `!` assertions and type the refs as `(HTMLInputElement | null)[]`. Clean up ref entries when test cases are removed.

### C16-CR-2 — Uncancelled requestAnimationFrame in public-header close handler [LOW]
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/layout/public-header.tsx:138`
- **Problem:** The `closeMobileMenu` callback fires a `requestAnimationFrame` that is never cancelled:
  ```tsx
  const closeMobileMenu = useCallback(() => {
    setMobileOpen(false);
    requestAnimationFrame(() => toggleRef.current?.focus());
  }, []);
  ```
  If the component unmounts before the RAF callback fires, the callback still executes. The current callback is safe (`toggleRef.current?.focus()` handles null), but this pattern is inconsistent with the RAF cleanup used elsewhere in the same file (lines 79-85) and could become a real bug if the callback is ever expanded.
- **Fix:** Store the RAF handle in a ref and cancel it in a cleanup effect, or inline the RAF cleanup pattern from lines 79-85.

## Previously Fixed (Verified at HEAD)

| ID | Status | Note |
|---|---|---|
| C15-CR-1 (bulk-create React key) | FIXED | Commit bcdfe429 |
| C15-CR-2 (file-upload index-based state) | FIXED | Commit 3c4506cd |
| C15-CR-3 (file-upload Math.random IDs) | FIXED | Commit 3c4506cd |
| C14-CR-1 (language admin shared AbortController) | FIXED | Commit 181a60e8 |
| C14-CR-2 (CopyCodeButton timer leak) | FIXED | Commit b4143450 |

## Carry-forward Deferred Items (NOT re-reported)

- C12b-1 through C12b-3: deferred per cycle 13 aggregate
