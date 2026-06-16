# Cycle 1 (RPF, 2026-06-16) — Function-Judging Responsive + Review Remediation

Source: `.context/reviews/_aggregate.md` + per-agent files. Primary focus this
run: responsive rendering of the `function` problem-type authoring + student UI
at mobile/tablet/desktop, verified with Playwright.

Repo policy that binds this plan and any later pickup of deferred items:
GPG-signed commits (`git commit -S`), Conventional Commits + gitmoji, no
`--no-verify`, no force-push to protected branches, no custom letter-spacing /
`tracking-*` on Korean text, preserve `src/lib/auth/config.ts`, latest
toolchains.

## SCHEDULED THIS CYCLE (implement in PROMPT 3)

### P1 — AGG-1 (High) Student tab bar overflows mobile viewport
- File: `src/components/ui/tabs.tsx:27` (`tabsListVariants`).
- Change: add `max-w-full` so the `inline-flex w-fit ... overflow-x-auto
  scrollbar-none` list caps at its container and scrolls instead of pushing the
  page wider than the viewport.
- Verify: `tests/e2e/function-judging-responsive.spec.ts` student-submit checks
  pass at 375/768/1280; no Korean tracking added.
- Status: DONE (implemented + verified in PROMPT 3).

### P2 — TST-1 (High) Add responsive render e2e for function authoring + submit UI
- File: `tests/e2e/function-judging-responsive.spec.ts` (new).
- Covers the edit page function sections, signature builder selects, languages
  multiselect, stub preview, and the student submit page at three viewports;
  plus the create-page type switch. No judge worker required.
- Status: DONE (added; the student-page test is the regression guard for P1).

## SCHEDULED — NEXT CYCLE(S) (not deferred; just out of this run's UI focus)

### P3 — AGG-2 (Medium) mapCompileError `:(\d+):` over-match
- File: `src/lib/judge/function-judging/error-mapping.ts:26`.
- Fix: gate the `:N:` rewrite on a preceding source-filename token; add a unit
  test (TST-2) asserting a non-line `:N:` token is not shifted.

### P4 — AGG-3 (Medium) Cross-language string-escaping divergence
- Files: `adapters/{cpp,java,go,csharp,javascript,typescript,python}.ts`.
- Fix: define one canonical JSON string-escaping contract; reconcile C++/Java/Go
  writers; add a cross-language golden test for string / string[] returns
  containing `<`,`>`,`&`, non-ASCII, quotes, control chars.

### P5 — AGG-4 (Medium) Document + assert single-line stdin contract
- Files: `serialization.ts` (assert no `\n` in `encodeArgs` output), design doc.

### P6 — AGG-5 (Medium) seed.ts FK ordering (roles before admin user)
- File: `scripts/seed.ts` — move the built-in role seed (line ~210) before the
  super-admin user insert (line ~179) so a fresh DB with the
  `users_role_roles_name_fk` FK bootstraps cleanly.

### P7 — AGG-6/AGG-7 (Low) Local Playwright webServer bring-up
- `playwright.config.ts` + `scripts/playwright-local-webserver.sh`: the
  placeholder `JUDGE_AUTH_TOKEN` is rejected by `getValidatedJudgeAuthToken`
  (env.ts:226) and `next start` no-ops under `output:standalone`. Make the local
  webServer mint a strong token and serve via `next dev` or the standalone
  server entrypoint.

### P8 — Low cleanups
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
  `AUTHORABLE_FUNCTION_TYPES` (`src/lib/judge/function-judging/types.ts:20`) in
  v1, so this code path is unreachable from any authorable problem — it is a
  latent (non-exploitable) correctness issue, not a current security/correctness/
  data-loss defect. The repo's own design note (types.ts:11-22) documents that
  double is deferred to v1.1 with the mapping code kept intact, which is the
  authority permitting this deferral.
- Severity: Low (latent). Confidence: High.
- Exit criterion: RE-OPEN and fix (C++ force `"C"` locale / manual format; Java
  `String.format(Locale.ROOT, ...)`) BEFORE `double`/`double[]` is added back to
  `AUTHORABLE_FUNCTION_TYPES`. A cross-locale double golden test must accompany
  the re-enable.

## PROGRESS
- 2026-06-16: P1 implemented (max-w-full on TabsList). P2 added
  (function-judging-responsive.spec.ts). Both verified green at 375/768/1280
  against a local server. P3–P8 scheduled for a later cycle; D1 deferred with
  exit criterion. No finding dropped.
- Gates (whole repo): tsc 0 errors, eslint 0/0, lint:bash 0, vitest
  2776 passed (359 files), next build exit 0 (7 pre-existing Edge-runtime
  `process.exit` warnings in production-config.ts, unrelated), new e2e spec
  16/16 green. The 6 responsive-layout `duplicate footer` failures are
  pre-existing dev-server-only (reproduced at HEAD without the change).
- Deploy (DEPLOY_MODE=per-cycle): per-cycle-success. worv + auraedu + algo all
  "Deployment complete" with HTTP 200 + HTTPS 200 verified by the script and
  re-confirmed live (test.worv.ai, oj.auraedu.me, algo.xylolabs.com all 200).
  Post-deploy smoke 6-7 failures per leg are the pre-existing "Step 1: Login"
  credential timeouts (documented since cycle-5), not a regression.
EOF
echo "plan written"; ls plan/*.md