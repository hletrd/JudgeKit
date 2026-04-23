# RPF Cycle 4 — Document Specialist

**Date:** 2026-04-22
**Base commit:** 5d89806d

## Findings

### DOC-1: `apiJson` helper JSDoc says "Use this instead of the raw `await response.json()` pattern" but no component uses it [MEDIUM/LOW]

**File:** `src/lib/api/client.ts:44-60`
**Confidence:** HIGH

The `apiJson` helper's JSDoc encourages its use as a replacement for the raw `response.json()` pattern. However, no component in the codebase actually uses it. This creates a discrepancy between the documentation (which says to use `apiJson`) and the actual code (which uses the manual `response.ok` + `.json().catch()` pattern).

**Fix:** Either update the JSDoc to reflect the actual usage pattern, or migrate components to use `apiJson`. The manual pattern is consistent and well-understood, so updating the JSDoc may be the pragmatic choice.

---

### DOC-2: `apiFetch` JSDoc mentions "Always check `response.ok` before calling `response.json()`" but some components still don't follow this [LOW/LOW]

**File:** `src/lib/api/client.ts:25`

The `apiFetch` JSDoc correctly documents the critical pattern of checking `response.ok` before calling `.json()`. However, `invite-participants.tsx:78` and `access-code-manager.tsx:42,88` don't follow this pattern with `.catch()`. The JSDoc should either explicitly mention the `.catch()` pattern or should reference `apiJson`.

---

### DOC-3: Cycle 3 remediation plan is properly documented [VERIFIED]

The cycle 3 remediation plan at `plans/open/2026-04-22-rpf-cycle-3-review-remediation.md` is properly marked as COMPLETED with all tasks checked off. The deferred items are clearly documented with severity, reason, and exit criterion.

---

## Verified Safe

- `useVisibilityPolling` hook has clear JSDoc explaining its behavior
- `apiFetch` JSDoc is accurate about CSRF header handling
- `SubmissionListAutoRefresh` has inline comment explaining the fetch-based backoff design
