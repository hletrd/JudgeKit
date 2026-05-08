# Aggregate Review -- Cycle 16/100

**Date:** 2026-05-08
**HEAD:** 5aef3f6f
**Reviewers:** self-review (manual comprehensive sweep; no registered Agent tools for fan-out)
**Scope:** Full TypeScript/TSX source review focusing on ref safety, RAF cleanup, React patterns, and security posture

---

## Total Deduplicated NEW Findings

**0 HIGH, 0 MEDIUM, 2 LOW**

---

## Findings

### C16-1: Callback ref non-null assertion in create-problem-form
- **Severity:** LOW
- **Confidence:** HIGH
- **File+line:** `src/app/(public)/problems/create/create-problem-form.tsx:875,916`
- **Issue:** Test-case file input callback refs use `el!` (non-null assertion):
  ```tsx
  ref={(el) => { testCaseInputFileRefs.current[index] = el!; }}
  ref={(el) => { testCaseOutputFileRefs.current[index] = el!; }}
  ```
  React calls ref callbacks with `null` on unmount. The `!` suppresses TypeScript's null check, silently assigning `null` to the array slot. While current callers use `?.click()`, this is a latent hazard for future code. Additionally, the ref arrays grow indefinitely and are never cleaned up when test cases are removed.
- **Fix:** Type refs as `(HTMLInputElement | null)[]`, remove `!`, and clean up entries in `removeTestCase`.

### C16-2: Uncancelled requestAnimationFrame in public-header close handler
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File+line:** `src/components/layout/public-header.tsx:138`
- **Issue:** `closeMobileMenu` fires an uncancelled RAF:
  ```tsx
  requestAnimationFrame(() => toggleRef.current?.focus());
  ```
  Inconsistent with the RAF cleanup pattern used elsewhere in the same file (lines 79-85). The current callback is safe due to optional chaining, but the pattern could become a real bug if expanded.
- **Fix:** Store RAF handle in a ref and cancel on cleanup, matching the pattern at lines 79-85.

---

## Areas Verified (No Issues Found)

- **AbortController cleanup:** All fetch-based components properly abort in-flight requests on unmount
- **Timer cleanup:** All setTimeout/setInterval usages have proper cleanup
- **Event listener cleanup:** All addEventListener calls have matching removeEventListener
- **JSON.parse guards:** All JSON.parse calls either have try/catch or are in safe contexts
- **React key stability:** All dynamic `.map()` uses stable IDs except skeleton arrays
- **Judge routes:** All 5 judge API routes properly guard `request.json()` with try/catch
- **CSRF coverage:** All mutating POST endpoints have CSRF protection or correct exemptions
- **Type safety:** No `@ts-ignore`, no `any` types in source
- **Security:** No new vulnerabilities; auth, rate-limiting, and XSS protections verified

---

## Already-fixed findings from prior cycles (verified at HEAD)

All cycle 1-15 fixes remain resolved. Key verified areas:
- Bulk-create React key stability (cycle 15)
- File-upload nanoid IDs and ID-based matching (cycle 15)
- Separate AbortControllers per operation in language-config-table (cycle 14)
- Timer leak fixes in CopyCodeButton, CountdownTimer (cycles 13-14)
- JSON parse guards in all judge routes (cycle 13)
- AbortController cleanup in submission polling, accepted solutions, submission overview (cycle 13)

---

## Carry-forward DEFERRED items

All deferred items from prior aggregates remain deferred with unchanged exit criteria. See `_aggregate-cycle-15.md` (2026-05-08) for full list.

No new deferred items this cycle.

---

## Review methodology notes

- Full grep sweeps for: refs, RAF, timers, JSON.parse, event listeners, keys, catches, any, ts-ignore
- Full reads of recently modified files and their tests
- Re-verification of all cycle 15 fixes
- All 575+ TS/TSX files in scope
- All gates pass (eslint, tsc, next build, vitest integration + component)
