# Cycle 4 (RPF, 2026-06-17) — Function-Judging Responsive (browser re-verify) + local e2e auth fix

Source: `.context/reviews/_aggregate.md` + `.context/reviews/designer.md`
(browser-driven), `.context/reviews/code-reviewer.md`,
`.context/reviews/test-engineer.md`. Primary focus this run: responsive
rendering of the `function` problem-type authoring + student UI at
mobile/tablet/desktop, verified live with a real browser (Playwright/Chromium +
agent-browser).

Repo policy that binds this plan and any later pickup of deferred items:
GPG-signed commits (`git commit -S`), Conventional Commits + gitmoji, no
`--no-verify`, no force-push to protected branches, no custom letter-spacing /
`tracking-*` on Korean text, preserve `src/lib/auth/config.ts`, latest
toolchains.

## BROWSER RE-VERIFY RESULT (primary focus) — NO NEW RESPONSIVE DEFECTS
The full `tests/e2e/function-judging-responsive.spec.ts` ran live against the
Next 16 standalone production server (seeded Postgres, real `twoSum` function
problem, 7 enabled languages) at mobile 375 / tablet 768 / desktop 1280. All 16
assertions GREEN:
- Authoring `/problems/[id]/edit`: function sections render, `documentWidth <=
  viewport+1`, `#fn-name` / type selects / 7 language labels / stub `<pre>` /
  CodeEditor all contained at every width.
- Create `/problems/create` (problemType→function at 375): no overflow.
- Student `/practice/problems/[id]`: no overflow; DSG-1 tab-bar guard passes
  (`flex-start`, active tab `notClippedLeft`+`fullyVisible`, list still scrolls).
No new responsive defect surfaced — earned convergence on the UI focus holds.
Evidence in `.context/reviews/designer.md`.

## DONE THIS CYCLE (implemented in PROMPT 3)

### P1 — AGG4-1 / DSG4-1 / TST4-1 (Medium) Local e2e auth fully broken → responsive gate could not run — FIXED
- Problem: the seeded admin is `mustChangePassword=true` (`scripts/seed.ts:225`);
  the Next 16 standalone local server runs `NODE_ENV=production`; the
  change-password form's automatic re-`signIn` (`change-password-form.tsx:51`)
  races the just-invalidated session token and strands the browser on
  `/change-password` even though the change committed. Every `loginAsAdmin` timed
  out → all 16 responsive tests failed in `beforeAll`. The spec also set the new
  password == current, worsening the race.
- Fix:
  1. `scripts/playwright-local-webserver.sh`: after `npm run seed`, clear
     `must_change_password` for the seeded admin in the DISPOSABLE local DB (one
     `docker exec … psql … UPDATE users …`). Production seed semantics untouched.
  2. `tests/e2e/function-judging-responsive.spec.ts`: `loginAsAdmin` now sets a
     DISTINCT strong policy-compliant new password if a forced change still
     appears (against a remote server) and tracks it in a module-level
     `adminPassword` so later logins use it.
- Verify: all 16 function-judging responsive tests green at mobile/tablet/desktop
  (done — `16 passed`). `lint:bash` does not cover this script, but `bash -n`
  passes.
- Status: DONE.

## CARRIED FORWARD — NEXT CYCLE(S) (still open; out of this UI run's scope)

### CF-1 — AGG-2 (Medium) mapCompileError `:(\d+):` over-match
- `src/lib/judge/function-judging/error-mapping.ts:26`. Gate the `:N:` rewrite on
  a preceding source-filename token; add unit test (TST-2) proving a bare `:8:`
  in prose is untouched. Re-confirmed real this cycle.

### CF-2 — AGG-3 (Medium) Cross-language string-escaping divergence (WIDENED)
- `adapters/{cpp,java,go,python,javascript,typescript,csharp}.ts`. Expected is
  computed in ONE reference language then compared against ANY student language.
  Reconcile to one canonical escaping contract (recommend: `<>&` raw + non-ASCII
  raw → Python `ensure_ascii=False`, Go `Encoder.SetEscapeHTML(false)`). Add a
  cross-language golden test for `string`/`string[]` returns with `<`,`>`,`&`,
  non-ASCII, quotes, backslash, control chars. Re-confirmed AND widened this
  cycle (Python's default `ensure_ascii=True` diverges on non-ASCII).

### CF-3 — AGG-4 (Medium) Document + assert single-line stdin contract
- `serialization.ts` (assert no raw `\n` in `encodeArgs` output) + design doc.
  Re-confirmed real this cycle.

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

## OBSERVATIONS (not scheduled app work)
- change-password local-prod re-auth race (mechanism behind AGG4-1): only
  triggers under the standalone production server with a forced first-login
  change AND a near-instant automated re-auth — not a human path. No app change
  scheduled; revisit only if it recurs for real users.

## PROGRESS
- 2026-06-17: Browser re-verify pass completed (all 16 function-judging
  responsive tests green at mobile/tablet/desktop; no new responsive defect;
  DSG-1 fix re-confirmed live). P1 (AGG4-1 local e2e auth) found and FIXED in
  PROMPT 3. CF-1..CF-3, CF-5 carried forward unchanged; D1 deferred with exit
  criterion. No finding dropped.
