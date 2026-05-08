# Aggregate Review — Cycle 6/100 (Current)

**Date:** 2026-05-08
**HEAD:** main / 75d82a17
**Reviewers:** code-reviewer, test-engineer (orchestrator direct; no registered Agent tools)
**Scope:** Full TypeScript/TSX source review + test suite verification
**Approach:** Static code analysis, pattern-based search, gate execution

---

## NEW FINDINGS THIS CYCLE

| ID | Severity | Confidence | Title | Source |
|---|---|---|---|---|
| C6-CR-1 | MEDIUM | HIGH | PublicFooter duplicate React keys when CMS footer content contains /privacy or /languages | code-reviewer |
| C6-CR-2 | LOW | MEDIUM | Chat widget messages use index-based React key | code-reviewer |
| C6-TE-1 | MEDIUM | HIGH | PublicFooter component test emits React duplicate-key warning | test-engineer |

---

## CROSS-AGENT AGREEMENT

- **C6-CR-1 / C6-TE-1** are the same root cause: `PublicFooter` unconditionally appends hardcoded privacy/languages links to CMS-provided links, and the map uses `key={link.url}`. The test-engineer observed the warning in test output; code-reviewer traced it to the component logic. Both agree this is a real production bug, not just a test artifact.

---

## DETAILED FINDINGS

### C6-CR-1 — PublicFooter duplicate React keys

- **File:** `src/components/layout/public-footer.tsx`, lines 36, 49
- **Problem:** `allLinks = [...links, languagesLink, privacyLink]` concatenates CMS links with hardcoded ones. When CMS content already contains `/privacy` or `/languages`, `key={link.url}` produces duplicates.
- **Evidence:** Component test at `tests/component/public-footer.test.tsx:35` supplies `{ label: "Privacy", url: "/privacy" }`, triggering the React warning:
  ```
  Encountered two children with the same key, `/privacy`. Keys should be unique...
  ```
- **Fix:** Deduplicate `allLinks` by URL before rendering, or conditionally skip injecting hardcoded links when the CMS content already contains them.

### C6-CR-2 — Chat widget index-based React key

- **File:** `src/lib/plugins/chat-widget/chat-widget.tsx`, line 334
- **Problem:** `messages.map((msg, i) => <div key={i} ...>)` uses array index as React key.
- **Impact:** Fragile against future message edits (deletion, reordering). Currently append-only so no active bug, but violates React best practices.
- **Fix:** Use a stable message identifier (`msg.id`, `msg.timestamp`, etc.) as the key.

### C6-TE-1 — PublicFooter test duplicate-key warning

- **File:** `tests/component/public-footer.test.tsx`
- **Problem:** The test mock data includes a `/privacy` link that collides with the component's hardcoded privacy link.
- **Impact:** Console noise in tests; does not assert DOM stability.
- **Fix:** Fix the component (C6-CR-1) which will also resolve the test warning.

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

## NEW_FINDINGS COUNT: 2
