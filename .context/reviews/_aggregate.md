# Aggregate Review -- Cycle 18/100

**Date:** 2026-05-08
**HEAD:** 2b3e22c1
**Reviewers:** self-review (manual comprehensive sweep; no registered Agent tools for fan-out)
**Scope:** Full TypeScript/TSX source review focusing on RAF cleanup, accessibility, and re-verification of cycles 15-17 fixes

---

## Total Deduplicated NEW Findings

**0 HIGH, 0 MEDIUM, 2 LOW**

---

## Findings

### C18-1: Uncancelled RAF in contest-replay layout effect
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File+line:** `src/components/contest/contest-replay.tsx:143`
- **Issue:** The `useIsomorphicLayoutEffect` calls `requestAnimationFrame` without storing or cancelling the handle. If `selectedSnapshot` changes rapidly (e.g., fast-forward at 8x speed) or the component unmounts during the 450ms transition, RAF callbacks from prior snapshots may run on detached or already-transitioned DOM elements. While style mutations on detached elements are no-ops in modern browsers, this is a dangling-reference pattern inconsistent with the RAF cleanup used elsewhere in the codebase.
- **Fix:** Store RAF handles in a ref array and cancel them in the layout effect cleanup.

### C18-2: File upload dropzone lacks keyboard accessibility
- **Severity:** LOW
- **Confidence:** HIGH
- **File+line:** `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx:171-196`
- **Issue:** The drag-and-drop zone is a `<div>` with `onClick` handler but lacks `role="button"`, `tabIndex={0}`, and `onKeyDown` handlers for Enter/Space. The nested `<input type="file" className="hidden">` uses Tailwind `hidden` (`display: none`), which removes it from the accessibility tree. Keyboard-only users cannot activate the file picker.
- **Fix:** Add `role="button"`, `tabIndex={0}`, `aria-label`, and an `onKeyDown` handler that triggers the file input on Enter/Space to the dropzone div.

---

## Areas Verified (No Issues Found)

- **Cycle 15-17 fixes:** All verified at HEAD and remain resolved
- **AbortController cleanup:** All fetch-based components properly abort in-flight requests on unmount
- **Timer cleanup:** All setTimeout/setInterval usages have proper cleanup
- **Event listener cleanup:** All addEventListener calls have matching removeEventListener
- **JSON.parse guards:** All JSON.parse calls either have try/catch or are in safe contexts
- **React key stability:** All dynamic `.map()` uses stable IDs except skeleton arrays
- **Judge routes:** All 5 judge API routes properly guard `request.json()` with try/catch
- **CSRF coverage:** All mutating POST endpoints have CSRF protection or correct exemptions
- **Type safety:** No `@ts-ignore`, no `any` types in source
- **Security:** No new vulnerabilities; auth, rate-limiting, and XSS protections verified
- **Korean letter spacing:** All `tracking-*` usages are either conditional on locale or documented as ASCII-only

---

## Already-fixed findings from prior cycles (verified at HEAD)

All cycle 1-17 fixes remain resolved. Key verified areas:
- json-ld.tsx U+2028/U+2029 escaping (cycle 17)
- node-shutdown.ts beforeExit catch (cycle 17)
- locale-switcher.tsx Secure flag (cycle 17)
- dropdown-menu.tsx ASCII-only documentation (cycle 17)
- public-footer.tsx suppressHydrationWarning (cycle 17)
- create-problem-form ref cleanup (cycle 16)
- public-header RAF cleanup (cycle 16)
- Bulk-create React key stability (cycle 15)
- File-upload nanoid IDs and ID-based matching (cycle 15)

---

## Carry-forward DEFERRED items

All deferred items from prior aggregates remain deferred with unchanged exit criteria. See `_aggregate-cycle-15.md` (2026-05-08) for full list.

No new deferred items this cycle.

---

## Review methodology notes

- Full grep sweeps for: refs, RAF, timers, JSON.parse, event listeners, keys, catches, any, ts-ignore, eslint-disable, tracking-*
- Full reads of: recently modified files (file-upload-dialog, bulk-create-dialog, public-header, locale-switcher, json-ld, node-shutdown, dropdown-menu, create-problem-form)
- Re-verification of all cycle 15-17 fixes
- All 575+ TS/TSX files in scope
- All gates pass (eslint, tsc, next build, vitest integration + component)
