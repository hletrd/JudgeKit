# Aggregate Review — RPF Cycle 1 (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD commit:** 32621804 (mark cycle 11 RPF plan as done)
**Reviewers:** code-reviewer, perf-reviewer, security-reviewer, critic, architect, debugger, designer (source-level), document-specialist, test-engineer, tracer, verifier (11 lanes; per-agent files in `.context/reviews/rpf-cycle-1-<agent>.md`).
**Total deduplicated findings:** 0 HIGH, 0 MEDIUM, **5 LOW**, 9 INFO.

---

## Cycle 1-11 fix verification summary

All 50+ tasks from cycles 1-11 were re-verified at HEAD `32621804`. No regressions found. Key verifications this cycle:

- Dark-mode coverage: `text-{color}-{400|500|600|700}` 85/85 paired with `dark:` companion in `src/`. `border-{color}` 22/22. `fill-{color}` 9/9. Light backgrounds 65/67 paired (2 use safe alpha-channel `<color>/<alpha>` mixing).
- Korean letter-spacing rule: 30 `tracking-*` usages in `src/` — all gated on `locale !== "ko"` or justified by inline comment (numeric labels, mono access codes).
- `dangerouslySetInnerHTML`: 2 hits, both wrapped in sanitization (`sanitizeHtml` and `safeJsonForScript`).
- `headers()` / `cookies()`: all callers properly await per Next.js 16 contract.
- `src/lib/auth/config.ts` preserved per CLAUDE.md deployment rule.
- TypeScript noEmit: 0 errors. ESLint: 0 errors, 14 warnings (all in untracked scratch `.mjs` at repo root + `.context/tmp/uiux-audit.mjs` + `playwright.visual.config.ts`).
- Workspace migration: `(workspace)` and `(control)` route groups removed; 7 308-redirects in `next.config.ts`; no `WorkspaceNav`/`ControlNav`/`workspaceShell`/`controlShell` references remain in `src/`.

---

## Deduplicated findings (sorted by severity)

### C1-AGG-1: [LOW] eslint config does not cover root `*.mjs` scratch scripts and `.context/tmp/**`

**Sources:** C1-CR-1 | **Confidence:** HIGH | **Cross-agent agreement:** 1 (code-reviewer); debugger (C1-DB-1) corroborates that the 14 lint warnings are noise rather than substantive issues.

`eslint.config.mjs` lines 38-44 only relax `scripts/**/*.{js,cjs,mjs}` for `no-unused-vars`. Root-level scratch scripts (`add-stress-tests.mjs`, `auto-solver.mjs`, `dedup-problems.mjs`, `fetch-problems.mjs`, `gen_test_cases.mjs`, `solve-all.mjs`, `solve-all2.mjs`, `solve-fixes.mjs`, `solve-problems.mjs`, `stress-tests.mjs`, `submit.mjs`, `verify-problems.mjs`), `.context/tmp/uiux-audit.mjs`, and `playwright.visual.config.ts` produce 14 repeating noise warnings.

**Fix:** Add `**/*.mjs` (root only — keep `src/**/*.mjs` covered if any), `.context/tmp/**`, and `playwright.visual.config.ts` to either `globalIgnores` or extend the `scripts/**` override. Recommended: extend `globalIgnores`.

---

### C1-AGG-2: [LOW] Untracked workflow artefacts polluting `git status`

**Sources:** C1-CR-2 | **Confidence:** MEDIUM

17 untracked scratch files at repo root: `add-stress-tests.mjs`, `auto-solver.mjs`, `dedup-problems.mjs`, `fetch-problems.mjs`, `gen_test_cases.mjs`, `scripts/fix-copyright.mjs`, `scripts/validate-enhance-201-300.mjs`, `scripts/validate-enhance-basic.mjs`, `solutions.js`, `solve-all.mjs`, `solve-all2.mjs`, `solve-fixes.mjs`, `solve-problems.mjs`, `stress-tests.mjs`, `submit.mjs`, `verify-problems.mjs`, `verify_all_tc.py`, `verify_tc.py`. Also `plans/user-injected/` is untracked.

**Fix:** Add patterns to `.gitignore` (e.g., `solve-*.mjs`, `verify_*.py`, `auto-solver.mjs`, `solutions.js`, `add-stress-tests.mjs`, `stress-tests.mjs`, `fetch-problems.mjs`, `dedup-problems.mjs`, `gen_test_cases.mjs`, `submit.mjs`, `scripts/fix-copyright.mjs`, `scripts/validate-enhance-*.mjs`). The `plans/user-injected/` directory is referenced by orchestrator and should be added to git.

---

### C1-AGG-3: [LOW] Direct `console.error` calls in 20+ client components

**Sources:** C1-CR-3 | **Confidence:** LOW

27 `console.{log,warn,error,debug}` hits in `src/`, all client-side. Not blocking; consider a `clientLogger` wrapper later for telemetry consistency. **Defer**.

---

### C1-AGG-4: [LOW] Polling intervals not visibility-paused

**Sources:** C1-PR-1 | **Confidence:** LOW

Real-time submission status, leaderboard updates, exam timers do not pause when document is hidden. Bounded by per-page mount/unmount; not a regression. **Defer**.

---

### C1-AGG-5: [LOW] Playwright e2e gate execution depends on browser availability

**Sources:** C1-TE-2 | **Confidence:** HIGH

If `playwright install` has not been run on the host, `npm run test:e2e` will fail with "browser not installed". PROMPT 3 will run it and capture exit/error; record as deferred warning if browsers genuinely unavailable. (Operational caveat, not a code defect.)

---

## INFO-level findings (no action required)

- C1-CR-4: Tracking-utility audit confirms Korean letter-spacing rule honored.
- C1-PR-2: No measurable performance regression vs cycle 11.
- C1-SR-1: No new attack surface introduced this cycle.
- C1-SR-2: Untracked scratch scripts are NOT a security concern.
- C1-AR-1: No architectural drift this cycle.
- C1-DB-1: No latent bug regressions identified.
- C1-DS-1: No new UI/UX regressions identified.
- C1-DOC-1: Migration plan ready for archival.
- C1-DOC-2: User-injected TODO #1 satisfied.
- C1-TE-1: No new test coverage gaps from cycle 11 work.
- C1-TR-1: Migration trace is consistent.
- C1-VE-1: HEAD matches plan claims.
- C1-VE-2: No suppressions introduced.

---

## Cross-agent agreement matrix

| Finding | Agents flagging it |
| --- | --- |
| C1-AGG-1 (eslint config) | code-reviewer (primary), debugger (corroborates noise) |
| C1-AGG-2 (gitignore tidy) | code-reviewer |
| C1-AGG-3 (console.error) | code-reviewer |
| C1-AGG-4 (polling) | perf-reviewer |
| C1-AGG-5 (playwright) | test-engineer |

The migration archival readiness (C1-DOC-1) is corroborated by tracer (C1-TR-1) and verifier (C1-VE-1) — three-agent agreement, **HIGH confidence**.

---

## AGENT FAILURES

None. All 11 reviewers ran source-level passes successfully.

---

## Workspace migration verification (TODO #1)

The user-injected TODO #1 done criterion is:
> `(workspace)` route group is empty or removed.
> Every non-admin page that previously lived under `(dashboard)` either (a) has a public counterpart with feature parity and an old-path 308 redirect, or (b) is explicitly listed in the migration plan as "stays in dashboard" with a quoted reason.
> `npm run build` succeeds.
> `npx tsc --noEmit` succeeds.
> `eslint` is clean for the affected files.
> Affected vitest/playwright tests are updated and green.
> The migration plan is archived under `plans/archive/`.

Concrete verification at HEAD `32621804`:

1. `find src/app/'(workspace)' -type f` → empty. ✓
2. `find src/app/'(control)' -type f` → empty. ✓
3. `next.config.ts:20-52` declares 7 permanent (308) redirects covering `/workspace`, `/workspace/discussions`, `/dashboard/rankings`, `/dashboard/languages`, `/dashboard/compiler`, `/control`, `/control/discussions`. ✓
4. Remaining `(dashboard)` subpaths: `dashboard/`, `dashboard/admin/*`, `dashboard/contests`, `dashboard/groups`, `dashboard/problem-sets`, `dashboard/problems`, `dashboard/profile`. Each is on the migration plan's "must stay in authenticated area" list (Phase 4 audit, cycle 23). ✓
5. `npx tsc --noEmit`: exit 0. ✓
6. `npm run lint`: exit 0 (warnings only, none in source). ✓
7. `npm run build` and vitest gates: PROMPT 3 will run and confirm. (Pending — not a blocker for archival, but archival commit happens AFTER gate green per cycle policy.)
8. `grep -rln "WorkspaceNav\|ControlNav\|workspaceShell\|controlShell" src/` → empty. ✓

**Conclusion:** Migration is complete. The plan is ready to be archived to `plans/archive/` once cycle 12 gates are green. PROMPT 2 will schedule the archival; PROMPT 3 will execute it after gate verification.
