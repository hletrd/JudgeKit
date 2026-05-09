# Debugger — Cycle 26

**Date:** 2026-05-09
**Cycle:** 26 of 100
**Base commit:** 5594a074
**Current HEAD:** 5594a074 (clean working tree)

---

## Findings

### DB-26-1: Transaction wrapper inconsistency may cause divergent behavior (carry-forward)

- **File**: `src/app/api/v1/judge/poll/route.ts:77,136`
- **Severity**: Low
- **Confidence**: Medium
- **Description**: If `execTransaction` is ever enhanced (e.g., with automatic retry, error logging, or metrics), the `db.transaction` path at line 136 would not benefit. This is a latent maintenance bug.
- **Fix**: Use `execTransaction` consistently.

### DB-26-2: LLM prompt injection could cause unexpected output (NEW)

- **File**: `src/lib/judge/auto-review.ts:162-167`
- **Severity**: Medium
- **Confidence**: Medium
- **Description**: Because user source code is embedded raw into the prompt, an attacker can cause the LLM to emit malformed, excessively long, or inappropriate content. The `.catch()` at `poll/route.ts:207-209` catches errors but does not handle invalid content.
- **Failure mode**: LLM outputs HTML/script tags or inappropriate language → stored in DB → rendered to students. While ReactMarkdown with `skipHtml` prevents script execution, inappropriate text content still reaches users.

---

## Prior Fixes Verified

| Fix | Status |
|---|---|
| C16 apiFetch timeout bypass | FIXED |
| C16 AbortSignal.timeout fallback | FIXED |
| C16 Chat widget hanging | FIXED |
| C16 File upload hanging | FIXED |
| C19 poll route transaction | NOT FIXED — still mixed (CARRY-FORWARD, 7 cycles) |
| C14 copy-code-button timer | FIXED |
| C14 language-config-table abort | FIXED |
| C25-1 trusted registry boundary | FIXED |
| C25-2 TABLE_MAP typing | FIXED |
| C25-3 stale images concurrency | FIXED |
| C25-4 image reference regex | FIXED |

---

## Regressions Checked

- Timer cleanup patterns: correct
- Event listener cleanup: correct
- AbortController cleanup: correct
- Async flow handling: correct

---

## Final Sweep

No latent bugs in timer handling, event listener management, async flow, or state mutation found.
