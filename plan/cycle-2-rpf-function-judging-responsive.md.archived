# Cycle 2 (RPF, 2026-06-16) — Function-Judging Responsive (tab clipping) + seed FK fix

Source: `.context/reviews/_aggregate.md` + `.context/reviews/designer.md`
(browser-driven). Primary focus this run: responsive rendering of the `function`
problem-type authoring + student UI at mobile/tablet/desktop, verified with a
real browser.

Repo policy that binds this plan and any later pickup of deferred items:
GPG-signed commits (`git commit -S`), Conventional Commits + gitmoji, no
`--no-verify`, no force-push to protected branches, no custom letter-spacing /
`tracking-*` on Korean text, preserve `src/lib/auth/config.ts`, latest
toolchains.

## SCHEDULED THIS CYCLE (implement in PROMPT 3)

### P1 — DSG-1 (Medium) Active/first problem tab clipped on overflowing tab bar
- File: `src/components/ui/tabs.tsx:27` (`tabsListVariants`).
- Change: `justify-center` → `justify-start`. With `overflow-x-auto` +
  `max-w-full`, centring an overflowing tab bar clips BOTH ends and leaves the
  left-clipped (active) tab unreachable (`scrollLeft=0` is already the left
  limit). `justify-start` lets the list scroll cleanly from the left.
- Proven in-browser: `offsetLeft -13 → 19`, active tab fully visible, list still
  scrolls (`scrollWidth 406 > clientWidth 343`). No-op for the non-overflowing
  `w-fit` desktop case (`firstOffsetLeft=99` unchanged).
- Verify: extend `tests/e2e/function-judging-responsive.spec.ts` with a student
  tab-bar regression check (active tab `offsetLeft >= list padding`, active tab
  fully within the list rect) at mobile. No Korean tracking added.
- Status: DONE (implemented + verified in PROMPT 3).

### P2 — AGG-5 (Medium) seed.ts FK ordering (roles before admin user)
- File: `scripts/seed.ts` — seed built-in roles BEFORE the super-admin user so a
  fresh DB with the `users_role_roles_name_fk` FK (schema.pg.ts:34, onDelete:
  restrict) bootstraps without a constraint violation.
- Verify: fresh-DB `npm run seed` succeeds; 5 roles + 1 super_admin present.
- Status: DONE (implemented + verified live this cycle; was a hard blocker for
  the browser review's local server bring-up).

### P3 — extend responsive e2e for the tab-clipping regression
- File: `tests/e2e/function-judging-responsive.spec.ts` — add a mobile student
  tab-bar test asserting the active tab is not clipped left and is fully within
  the scroll container.
- Status: DONE.

## CARRIED FORWARD — NEXT CYCLE(S) (still open; not deferred, just out of this UI run's scope)

### CF-1 — AGG-2 (Medium) mapCompileError `:(\d+):` over-match
- `src/lib/judge/function-judging/error-mapping.ts:26`. Gate the `:N:` rewrite on
  a preceding source-filename token; add unit test (TST-2).

### CF-2 — AGG-3 (Medium) Cross-language string-escaping divergence
- `adapters/{cpp,java,go,csharp,javascript,typescript,python}.ts`. Define one
  canonical JSON string-escaping contract; reconcile C++/Java/Go writers; add a
  cross-language golden test for string / string[] returns with `<`,`>`,`&`,
  non-ASCII, quotes, control chars.

### CF-3 — AGG-4 (Medium) Document + assert single-line stdin contract
- `serialization.ts` (assert no `\n` in `encodeArgs` output) + design doc.

### CF-4 — AGG-6/AGG-7 (Low) Local Playwright webServer bring-up
- `playwright.config.ts` + `scripts/playwright-local-webserver.sh`: the
  placeholder `JUDGE_AUTH_TOKEN` is rejected by `getValidatedJudgeAuthToken`
  (env.ts:223-227) and `next start` no-ops under `output:standalone`. Make the
  local webServer mint a strong token and serve via `next dev` or the standalone
  server entrypoint. (Worked around this cycle by serving via `next dev`.)

### CF-5 — Low cleanups
- SEC-3: trim host paths from compute-expected returned diagnostics.
- PERF-1: optional concurrency cap for compute-expected case runs.
- ARC-4: extract shared `resolveExecLanguage` used by compute-expected and
  compiler/run.
- DBG-4: confirm prompt when removing a param that has authored values.
- TST-3/TST-4: serialization round-trip fuzz for string[]; integration test that
  student GET omits `referenceSolution`.

## DEFERRED (existing review findings; severity preserved, exit criteria stated)

### D1 — CR-2 / VER-3 (Low, latent) Locale-sensitive double printers (C++/Java)
- Files: `adapters/cpp.ts:115`, `adapters/java.ts:176`.
- Reason for deferral: `double`/`double[]` are intentionally excluded from
  `AUTHORABLE_FUNCTION_TYPES` (`types.ts:20`) in v1, so this code path is
  unreachable from any authorable problem — a latent (non-exploitable)
  correctness issue. The repo's own design note (types.ts:11-22) documents that
  double is deferred to v1.1 with the mapping code kept intact, which is the
  authority permitting this deferral.
- Severity: Low (latent). Confidence: High.
- Exit criterion: RE-OPEN and fix (C++ force `"C"` locale / manual format; Java
  `String.format(Locale.ROOT, ...)`) BEFORE `double`/`double[]` is added back to
  `AUTHORABLE_FUNCTION_TYPES`. A cross-locale double golden test must accompany
  the re-enable.

## PROGRESS
- 2026-06-16: P2 (seed FK order) implemented first as a bring-up blocker and
  verified on a fresh DB. P1 (tabs justify-start) + P3 (tab-clipping e2e guard)
  scheduled and implemented in PROMPT 3. Carried-forward CF-1..CF-5 + D1
  unchanged; no finding dropped.
