# Code Review — Cycle 7

**Reviewer:** code-reviewer (orchestrator direct)
**Date:** 2026-05-08
**Scope:** Full TypeScript/TSX source review

---

## Findings

### C7-CR-1 [MEDIUM, HIGH confidence] Footer content form uses index-based React keys for removable links

- **File:** `src/app/(dashboard)/dashboard/admin/settings/footer-content-form.tsx`, line 137
- **Code:** `links.map((link, i) => <div key={i} className="flex items-center gap-2">`
- **Problem:** The footer links array renders with `key={i}` where items can be added and removed via `removeLink(loc, i)`. When a link is removed, all subsequent indices shift down by one. React sees the same keys (`0`, `1`, etc.) but different content, causing it to reuse DOM nodes incorrectly. While the inputs are controlled (reducing visible data corruption), this can cause focus loss on the removed item's successor and unnecessary re-renders.
- **Fix:** Generate a stable temporary id when adding new links and use it as the key, or use a composite key like `key={`${loc}-${link.url}-${i}`}`.

### C7-CR-2 [MEDIUM, HIGH confidence] Quick-create contest form uses index-based React keys for removable problems

- **File:** `src/components/contest/quick-create-contest-form.tsx`, line 153
- **Code:** `selectedProblems.map((sp, i) => (<div key={i} className="flex items-center gap-2">`
- **Problem:** Same pattern as C7-CR-1. `removeProblem(index)` filters by index, so removing a problem causes key shifts for all subsequent problems. The `<Select>` components inside each row maintain internal state that could be affected by incorrect key reuse.
- **Fix:** Use the problem id as the key: `key={sp.id}`. Problem IDs are guaranteed unique within the selectedProblems array.

### C7-CR-3 [LOW, MEDIUM confidence] File upload dialog has uncleaned setTimeout on success path

- **File:** `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx`, line 127
- **Code:** `setTimeout(() => { setQueue([]); onComplete(); }, 500);`
- **Problem:** The timeout is not stored or cleared. If the dialog closes/unmounts before 500ms elapses, `setQueue([])` attempts to update state on an unmounted component. In React development mode this produces a warning.
- **Fix:** Store the timeout ID in a `useRef` and clear it in the component cleanup or dialog close handler.

---

## Verified Resolved (from prior cycles)

- PublicFooter duplicate React keys (C6-CR-1) — verified fixed at HEAD
- Chat widget index-based keys (C6-CR-2) — verified fixed at HEAD, now uses nanoid-generated msg.id
- Timer leak in SubmissionListAutoRefresh — verified fixed at HEAD
- Database connection string exposure — verified fixed at HEAD
- Audit-logs SQL error for instructors with no groups — verified fixed at HEAD

---

## No Agent Failures

All review work performed directly by the orchestrator due to absence of registered Agent tools in this environment.
