# Aggregate Review — Cycle 7/100

**Date:** 2026-05-08
**Cycle:** 7/100 of review-plan-fix loop
**Reviewers:** code-reviewer, test-engineer, security-reviewer (orchestrator direct; no registered Agent tools)
**Scope:** Full TypeScript/TSX source review + test suite verification + security audit
**Approach:** Static code analysis, pattern-based search, gate execution

---

## NEW FINDINGS THIS CYCLE

| ID | Severity | Confidence | Title | Source |
|---|---|---|---|---|
| C7-CR-1 | MEDIUM | HIGH | Footer content form uses index-based React keys for removable links | code-reviewer |
| C7-CR-2 | MEDIUM | HIGH | Quick-create contest form uses index-based React keys for removable problems | code-reviewer |
| C7-CR-3 | LOW | MEDIUM | File upload dialog has uncleaned setTimeout on success path | code-reviewer |
| C7-TE-1 | LOW | MEDIUM | Footer content form lacks regression test for link removal | test-engineer |
| C7-TE-2 | LOW | MEDIUM | Quick-create contest form lacks regression test for problem removal | test-engineer |
| C7-SEC-1 | LOW | MEDIUM | Admin error boundary logs full error object with potential stack traces | security-reviewer |

---

## CROSS-AGENT AGREEMENT

- **C7-CR-1 / C7-TE-1** are the same root cause: footer links rendered with `key={i}` where items are removable. Test engineer recommends a regression test; code-reviewer recommends using stable keys.
- **C7-CR-2 / C7-TE-2** are the same root cause: quick-create contest problems rendered with `key={i}` where items are removable. Same dual fix: stable keys + regression test.
- **C7-CR-3 / C7-SEC-2** converge on the file upload dialog timeout leak. Security reviewer flags theoretical callback reference leak; code-reviewer flags missing cleanup.

---

## DETAILED FINDINGS

### C7-CR-1 — Footer content form index-based React keys

- **File:** `src/app/(dashboard)/dashboard/admin/settings/footer-content-form.tsx`, line 137
- **Problem:** `links.map((link, i) => <div key={i} ...>)` renders footer links with array index as React key. The `removeLink(loc, i)` function filters by index, so removing a link causes all subsequent indices to shift. React sees the same keys with different content, reusing DOM nodes incorrectly. This can cause focus loss on the successor of the removed item.
- **Fix:** Generate a stable temporary id when adding links, or use a composite key.

### C7-CR-2 — Quick-create contest form index-based React keys

- **File:** `src/components/contest/quick-create-contest-form.tsx`, line 153
- **Problem:** `selectedProblems.map((sp, i) => <div key={i} ...>)` renders problem selectors with array index as React key. `removeProblem(index)` filters by index, causing key shifts on removal. The `<Select>` components inside each row may retain incorrect internal state after a removal.
- **Fix:** Use the problem id as key: `key={sp.id}`.

### C7-CR-3 — File upload dialog uncleaned setTimeout

- **File:** `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx`, line 127
- **Problem:** `setTimeout(() => { setQueue([]); onComplete(); }, 500)` is fire-and-forget. If the dialog unmounts before 500ms, `setQueue([])` updates state on an unmounted component.
- **Fix:** Store timeout ID in a ref and clear in cleanup.

### C7-TE-1 — Footer content form test gap

- **File:** `tests/component/` (missing)
- **Problem:** No component test exists for footer content form link removal. The C7-CR-1 bug would be caught by a test that removes a middle link and asserts remaining links are correct.
- **Fix:** Add component test.

### C7-TE-2 — Quick-create contest form test gap

- **File:** `tests/component/` (missing)
- **Problem:** No component test covers the removeProblem interaction.
- **Fix:** Add component test.

### C7-SEC-1 — Admin error boundary full error logging

- **File:** `src/app/(dashboard)/dashboard/admin/error.tsx`, line 19
- **Problem:** `console.error("[admin-error-boundary]", error.digest ?? error.message, error)` passes the full Error object as the third argument. This may include `stack` property, leaking internal paths to the client console.
- **Fix:** Log only `error.digest` and `error.message`; omit the full object.

---

## VERIFIED RESOLVED (PRIOR CYCLES)

All cycle-6 fixes verified resolved at HEAD:
- PublicFooter duplicate React keys (C6)
- Chat widget index-based keys (C6)
- Timer leak in SubmissionListAutoRefresh (C5)
- Database connection string exposure (C5)
- Audit-logs SQL error for instructors with no groups (C5)

---

## AGENT FAILURES

No agent failures. All review work performed directly by the orchestrator due to absence of registered Agent tools in this environment.

---

## QUALITY GATES (pre-remediation)

- `eslint .` — PASS (0 errors, 0 warnings)
- `tsc --noEmit` — PASS
- `next build` — PASS
- `vitest run` — PASS (2337 tests)
- `vitest run --config vitest.config.component.ts` — PASS (167 tests)

---

## NEW_FINDINGS COUNT: 3 deduplicated (C7-CR-1, C7-CR-2, C7-CR-3/C7-SEC-1 convergence)
