# RPF Cycle 1 (orchestrator-driven, 2026-04-29) — Code Reviewer

**Date:** 2026-04-29
**HEAD commit:** 32621804 (cycle 11 RPF plan archived)
**Scope:** Whole repository (entire `src/`, root configs, plans, scripts).
**Method:** Inventory of file types, programmatic class/util grep across `src/`, manual cross-cutting checks against latest aggregate (cycle 11).

---

## Verification of cycle 1-11 fixes (status report)

- All previously cited dark-mode missing variants (cycles 5-11) re-verified with grep across `src/**`. 85 occurrences of `text-{red|green|blue|yellow|amber|emerald|orange|teal|cyan|indigo|violet|purple|pink|rose|sky}-{400|500|600|700}` were sampled — every single one in `src/` carries a `dark:` companion. Two non-`dark:` occurrences (`bg-red-500/12` in `src/components/layout/active-timed-assignment-sidebar-panel.tsx:144`, `bg-green-500/15` in `src/components/ui/badge.tsx:24`) use `<color>/<alpha>` channel mixing which is dark-mode safe.
- `border-{color}-{200|300|400}`: 22/22 paired with `dark:border-*` (or alpha mix).
- `fill-{color}-*`: 9/9 paired with dark variant.
- 2 instances of `dangerouslySetInnerHTML` (`src/components/problem-description.tsx:51`, `src/components/seo/json-ld.tsx:21`) — both passed through `sanitizeHtml` / `safeJsonForScript`. No XSS regression.
- `Promise.all([... headers(), ...])` in `src/app/layout.tsx:91-96` is a valid Next.js 16 async pattern; all other `cookies()`/`headers()` callers (`src/i18n/request.ts`, `src/lib/audit/events.ts`, `src/lib/actions/public-signup.ts`, `src/lib/security/server-actions.ts`) await correctly.

## Findings

### C1-CR-1: [LOW] eslint config missing root-level `*.mjs` and `.context/tmp/**` overrides

**Files:** `eslint.config.mjs` (lines 38-44 + 81-94); untracked scratch scripts at repo root (`add-stress-tests.mjs`, `auto-solver.mjs`, `dedup-problems.mjs`, `fetch-problems.mjs`, `gen_test_cases.mjs`, `solve-all.mjs`, `solve-all2.mjs`, `solve-fixes.mjs`, `solve-problems.mjs`, `stress-tests.mjs`, `submit.mjs`, `verify-problems.mjs`); `.context/tmp/uiux-audit.mjs`; `playwright.visual.config.ts:2`.

**Evidence:** `npm run lint` produces 14 warnings, all `@typescript-eslint/no-unused-vars` in untracked one-off scripts at the repo root and `.context/tmp/`. `eslint.config.mjs` lines 38-44 only relax `scripts/**/*.{js,cjs,mjs}` for the same rule. Nothing covers root-level scratch scripts or `.context/tmp/**`.

**Why a problem:** Each cycle's `npm run lint` invocation re-emits the same 14 noise warnings, masking real future warnings. Cycle policy requires "warnings best-effort" — currently they accumulate.

**Failure scenario:** When a real warning is introduced (e.g., a future unused import in `src/`), it gets buried in the noise from scratch scripts that aren't part of the production codebase.

**Suggested fix:** Either (a) add `**/*.mjs` (root only) and `.context/tmp/**` to `globalIgnores` in `eslint.config.mjs`, or (b) extend the `scripts/**` override to also cover `*.mjs` at root and `.context/tmp/**`. The scratch scripts at the repo root are not source-of-truth — they don't need lint coverage. Confidence: **HIGH**.

---

### C1-CR-2: [LOW] Untracked workflow artefacts polluting `git status`

**Files:** repo root — 17 untracked scratch files (`add-stress-tests.mjs`, `auto-solver.mjs`, `dedup-problems.mjs`, `fetch-problems.mjs`, `gen_test_cases.mjs`, `scripts/fix-copyright.mjs`, `scripts/validate-enhance-201-300.mjs`, `scripts/validate-enhance-basic.mjs`, `solutions.js`, `solve-all.mjs`, `solve-all2.mjs`, `solve-fixes.mjs`, `solve-problems.mjs`, `stress-tests.mjs`, `submit.mjs`, `verify-problems.mjs`, `verify_all_tc.py`, `verify_tc.py`).

**Evidence:** `git status --short` shows 17 untracked entries.

**Why a problem:** These problem-solving exploratory scripts clutter the repo root and produce repeating lint noise. If their purpose is one-off, they should live in a `.gitignored` workspace. If they're useful tools, they should be committed under `scripts/`.

**Suggested fix:** Add patterns to `.gitignore` (e.g., `solve-*.mjs`, `verify_*.py`, `auto-solver.mjs`, `solutions.js`, `add-stress-tests.mjs`, `stress-tests.mjs`, `fetch-problems.mjs`, `dedup-problems.mjs`, `gen_test_cases.mjs`, `submit.mjs`). Confidence: **MEDIUM** (judgement call on author intent).

---

### C1-CR-3: [LOW] Direct `console.error` calls in 20+ client components without structured logging

**Files (sample):** `src/components/code/compiler-client.tsx:294`, `src/components/discussions/discussion-thread-form.tsx:54`, `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:138,164,194`.

**Evidence:** `grep -rn 'console\.(log|warn|error|debug)' src/` returns 27 hits, all client-side.

**Why minor:** In production browser, `console.error` is fine for non-PII debug aid. But for consistency with `src/lib/logger.ts` (pino) and to avoid accidentally logging tokens/PII, a small client-safe `clientLogger` wrapper would centralize this. Not blocking — these are bounded contexts already prefixed with descriptive labels.

**Suggested fix:** Defer; document as a future refactor. Severity **LOW**. Confidence: **LOW**.

---

### C1-CR-4: [INFO] Tracking-utility audit confirms Korean letter-spacing rule honored

`grep -rn 'tracking-' src/` returned 30 hits. Each one either:
- Uses a conditional `${locale !== "ko" ? " tracking-tight" : ""}` pattern, or
- Is gated by an inline comment explicitly justifying tracking for Korean (e.g., monospace access codes, numeric "404" labels, mono font on `tracking-[0.35em]` access-code input).

No regressions. Repo policy compliant.

---

## Net new findings: 3 (all **LOW**)

No HIGH/MEDIUM regressions surfaced this cycle. The codebase has been steadily polished by cycles 1-11; cycle 12's net surface is small.

## Files reviewed

`src/app/`, `src/components/`, `src/lib/`, `src/hooks/`, `src/contexts/`, `src/i18n/`, `eslint.config.mjs`, `next.config.ts`, `package.json`, `.gitignore`.
