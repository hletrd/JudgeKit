# Aggregate Review -- Cycle 15/100

**Date:** 2026-05-08
**HEAD:** 6be44cd5
**Reviewers:** self-review (manual comprehensive sweep; no registered Agent tools for fan-out)
**Scope:** Full TypeScript/TSX source review focusing on recently modified files, React key stability, timer hygiene, and abort controller patterns

---

## Total Deduplicated NEW Findings

**0 HIGH, 0 MEDIUM, 3 LOW**

---

## Findings

### C15-1: Unstable React key in bulk-create-dialog preview table
- **Severity:** LOW
- **Confidence:** HIGH
- **File+line:** `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:347`
- **Issue:** CSV upload preview table uses array index `i` as React key:
  ```tsx
  {parsedRows.slice(0, 50).map((row, i) => (
    <TableRow key={i}>
  ```
  If identical rows appear at different positions, or if the parsed rows are re-sorted, React may not correctly update the DOM.
- **Fix:** Use a composite key based on row content, e.g. `key={`${row.username}-${row.name}-${i}`}`.

### C15-2: Index-based state update in file upload dialog
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File+line:** `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx:89-120`
- **Issue:** `handleUpload` updates queue items by index position (`idx === i`) rather than by stable ID. While removal is disabled during upload (`isUploading`), making this safe in practice, the pattern is fragile and could break if concurrent state updates are introduced.
- **Fix:** Update queue items by matching `item.id === queue[i].id` instead of by index.

### C15-3: Math.random() for ephemeral queue IDs
- **Severity:** LOW
- **Confidence:** LOW
- **File+line:** `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx:52`
- **Issue:** Upload queue item IDs use `Math.random()` for uniqueness. While the combination with file metadata makes collisions extremely unlikely, `Math.random()` is not cryptographically secure. For ephemeral UI state this is acceptable.
- **Fix:** Use `nanoid()` or `crypto.randomUUID()` for stronger uniqueness guarantees (optional cosmetic improvement).

---

## Areas Verified (No Issues Found)

- **AbortController cleanup:** All fetch-based components properly abort in-flight requests on unmount and dependency changes.
- **Timer cleanup:** All setTimeout/setInterval usages have proper cleanup in useEffect return functions.
- **Event listener cleanup:** All addEventListener calls have matching removeEventListener in cleanup.
- **JSON.parse guards:** All JSON.parse calls either have try/catch or are in contexts where failure is acceptable.
- **React key stability:** All `.map()` render loops use stable keys (IDs, not indices), except for static skeleton arrays and the one bulk-create-dialog preview noted above.
- **Judge routes:** All 5 judge API routes (claim, heartbeat, register, poll, deregister) properly guard `request.json()` with try/catch.
- **CSRF coverage:** All mutating POST endpoints either have CSRF protection or are correctly exempted.
- **Type safety:** No `@ts-ignore`, no `any` types in source.
- **Timer leaks:** CountdownTimer, SubmissionListAutoRefresh, CopyCodeButton, and all polling hooks have verified cleanup.

---

## Already-fixed findings from prior cycles (verified at HEAD)

All cycle 1-14 fixes remain resolved. Key verified areas:
- Separate AbortControllers per operation in language-config-table (cycle 14)
- Timer leak fixes in CopyCodeButton, CountdownTimer (cycles 13-14)
- JSON parse guards in all judge routes (cycle 13)
- Stable React keys in output-diff-view, structured-problem-statement (cycles 12-13)
- AbortController cleanup in submission polling, accepted solutions, submission overview (cycle 13)
- Hydration mismatch fixes in skeleton widths, locale switcher (cycles 11-12)

---

## Carry-forward DEFERRED items

All deferred items from prior aggregates remain deferred with unchanged exit criteria. See `_aggregate-cycle-15.md` (2026-05-03) for full list.

No new deferred items this cycle.

---

## Review methodology notes

- Full grep sweeps for: AbortController, timers, JSON.parse, event listeners, keys, catches, Math.random, any, ts-ignore
- Full reads of recently modified files and their tests
- Re-verification of all cycle 14 fixes
- All 575+ TS/TSX files in scope
- All gates pass (eslint, tsc, next build, vitest integration + component)
