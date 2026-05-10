# Cycle 17 Aggregate Review (review-plan-fix loop)

## Scope
- Aggregated from:
  - `code-reviewer.md` (code quality, correctness, maintainability)
  - `security-reviewer.md` (security, OWASP, auth/authz)
  - `perf-reviewer.md` (performance, UI responsiveness)
  - `test-engineer.md` (test coverage, flaky tests)
- Base commit: 919c8ba3

## Deduped Findings

### AGG-1 — [LOW] `DropdownMenuShortcut` applies `tracking-widest` unconditionally

- **Severity:** LOW (CLAUDE.md compliance)
- **Confidence:** HIGH
- **Cross-agent agreement:** C17-CR-1
- **Files:** `src/components/ui/dropdown-menu.tsx:247`
- **Evidence:** The `DropdownMenuShortcut` component renders `<span className="... tracking-widest ...">{props.children}</span>`. The `tracking-widest` class is applied unconditionally. While shortcut text is typically ASCII, the component accepts arbitrary children. If Korean text is passed, it violates the CLAUDE.md Korean letter-spacing rule.
- **Failure scenario:** Korean locale translation passes multi-character shortcut label containing Korean glyphs. Excessive spacing produces visually broken text.
- **Suggested fix:** Document ASCII-only requirement for children, or conditionally apply tracking based on locale/content.

### AGG-2 — [LOW] `JsonLd` component does not escape U+2028/U+2029 in JSON

- **Severity:** LOW (defense-in-depth XSS)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** C17-SEC-1
- **Files:** `src/components/seo/json-ld.tsx:11-15`
- **Evidence:** The `safeJsonForScript` function escapes `</script` and `<!--` but not Unicode line/paragraph separators (U+2028/U+2029). In pre-ES2019 environments, these are valid in JSON but invalid in JavaScript strings.
- **Suggested fix:** Add `.replace(/ /g, "\\u2028").replace(/ /g, "\\u2029")` to `safeJsonForScript`.

### AGG-3 — [LOW] `node-shutdown.ts:beforeExit` handler lacks `.catch()` on `flushAuditBuffer()`

- **Severity:** LOW (unhandled rejection during shutdown)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** C17-CR-3
- **Files:** `src/lib/audit/node-shutdown.ts:29`
- **Evidence:** The `beforeExit` handler calls `void flushAuditBuffer()` without `.catch()`. Unlike SIGTERM/SIGINT handlers which use `.finally()`, this one does not guard against rejection.
- **Suggested fix:** Add `.catch(() => {})` or log the error.

### AGG-4 — [LOW] `locale-switcher.tsx` cookie omits `Secure` flag on HTTP

- **Severity:** LOW (cookie security)
- **Confidence:** HIGH
- **Cross-agent agreement:** C17-SEC-2
- **Files:** `src/components/layout/locale-switcher.tsx:43`
- **Evidence:** Cookie is set with conditional `Secure` flag based on `location.protocol === "https:"`. On HTTP connections, the flag is omitted.
- **Suggested fix:** Always include `Secure` flag (production should always use HTTPS).

### AGG-5 — [LOW] `public-footer.tsx` uses `new Date().getFullYear()` in server component

- **Severity:** LOW (SSR/hydration edge case)
- **Confidence:** LOW
- **Cross-agent agreement:** C17-CR-2
- **Files:** `src/components/layout/public-footer.tsx:20`
- **Evidence:** Copyright year computed at SSR time. Year-boundary requests could produce server/client mismatch.
- **Suggested fix:** Use stable year source or suppress hydration mismatch for this element.

### AGG-6 — [LOW] Missing test coverage for `handleSignOutWithCleanup` error path

- **Severity:** LOW (test gap)
- **Confidence:** HIGH
- **Cross-agent agreement:** C17-TEST-1
- **Files:** `src/lib/auth/sign-out.ts:75-89`
- **Suggested fix:** Add unit test for sign-out failure path.

### AGG-7 — [LOW] Missing component tests for mobile menu focus trap

- **Severity:** LOW (test gap)
- **Confidence:** HIGH
- **Cross-agent agreement:** C17-TEST-2
- **Files:** `src/components/layout/public-header.tsx:105-129`
- **Suggested fix:** Add component tests for Tab/Shift+Tab focus wrapping.

## Previously Deferred Items (Carried Forward)

None newly identified for deferral this cycle. All findings are LOW severity.

## Agent Failures

No agent failures — manual review conducted due to absence of registered review agents in this environment.
