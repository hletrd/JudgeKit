# Cycle 3 (RPF, 2026-06-16) — Function-Judging Responsive (browser re-verify) + local e2e harness fix

Source: `.context/reviews/_aggregate.md` + `.context/reviews/designer.md`
(browser-driven) + `.context/reviews/code-reviewer.md`. Primary focus this run:
responsive rendering of the `function` problem-type authoring + student UI at
mobile/tablet/desktop, verified live with a real browser (agent-browser /
Chromium).

Repo policy that binds this plan and any later pickup of deferred items:
GPG-signed commits (`git commit -S`), Conventional Commits + gitmoji, no
`--no-verify`, no force-push to protected branches, no custom letter-spacing /
`tracking-*` on Korean text, preserve `src/lib/auth/config.ts`, latest
toolchains.

## BROWSER RE-VERIFY RESULT (primary focus) — NO NEW RESPONSIVE DEFECTS
A fresh browser pass (agent-browser 0.22.2, Chromium headless) drove the live
function-judging UI at mobile 375 / tablet 768 / desktop 1280, light + dark,
against a seeded local server with a real function problem:
- Student `/practice/problems/[id]`: DSG-1 fix (cycle 2) VERIFIED LIVE — tab bar
  `justify-content=flex-start`, active tab `notClippedLeft=true`,
  `fullyVisible=true`, list still scrolls (`scrollWidth 406 > clientWidth 343`);
  page `overflow=0` at all three widths.
- Authoring edit `/problems/[id]/edit`: `overflow=0`, `bleedCount=0` at all three
  widths and in dark mode; `#fn-name`, `#fn-return-type` (max-w 200), 3 type
  selects, 7 language labels, 6 test-case inputs, stub `<pre>` and CodeEditor all
  contained.
- Create page covered by the existing passing Playwright spec.
No new responsive defect surfaced — earned convergence on the UI focus. Evidence
in `.context/reviews/designer.md`.

## SCHEDULED THIS CYCLE (implement in PROMPT 3)

### P1 — AGG-8 / CF-4 (Low) Make the local Playwright webServer self-start
- Files: `scripts/playwright-local-webserver.sh`, `playwright.config.ts`.
- Problem (re-confirmed live):
  1. `playwright.config.ts:81` falls back to `JUDGE_AUTH_TOKEN ??
     "playwright-local-token-for-smoke"`, byte-identical to
     `JUDGE_AUTH_TOKEN_PLAYWRIGHT_PLACEHOLDER` (`src/lib/security/env.ts:6`), which
     `getValidatedJudgeAuthToken()` (env.ts:223-229) REJECTS → app throws at boot.
  2. `scripts/playwright-local-webserver.sh:45` runs `npm run start` (`next
     start`) while `next.config.ts:9` sets `output: "standalone"` (Next 16.2.3) —
     not the supported serve path; the build emits `.next/standalone/server.js`.
- Fix:
  - In the webServer script, mint a strong ephemeral `JUDGE_AUTH_TOKEN`
    (`openssl rand -hex 32`) when none is provided, and `export` it so both
    `next build` and the running server share it; copy `.next/static` +
    `public` into `.next/standalone` and launch `node .next/standalone/server.js`
    with `PORT`/`HOSTNAME` set (the standard standalone serve recipe).
  - In `playwright.config.ts`, stop injecting the rejected placeholder: pass the
    operator's `JUDGE_AUTH_TOKEN` through only when present, and otherwise let the
    script mint one (do not hand the server a known-rejected value).
- Verify: `bash scripts/playwright-local-webserver.sh` (or the Playwright
  webServer) brings the app up and serves HTTP 200 with NO strong token
  pre-exported; `tsc`/lint/lint:bash clean.
- Status: PENDING.

## CARRIED FORWARD — NEXT CYCLE(S) (still open; not deferred, just out of this UI run's scope)

### CF-1 — AGG-2 (Medium) mapCompileError `:(\d+):` over-match
- `src/lib/judge/function-judging/error-mapping.ts:26`. Gate the `:N:` rewrite on
  a preceding source-filename token; add unit test (TST-2). Re-confirmed real
  this cycle.

### CF-2 — AGG-3 (Medium) Cross-language string-escaping divergence
- `adapters/{cpp,java,go,csharp,javascript,typescript,python}.ts`. One canonical
  JSON string-escaping contract; reconcile C++/Java/Go writers; cross-language
  golden test for string / string[] returns with `<`,`>`,`&`, non-ASCII, quotes,
  control chars. Re-confirmed real this cycle.

### CF-3 — AGG-4 (Medium) Document + assert single-line stdin contract
- `serialization.ts` (assert no `\n` in `encodeArgs` output) + design doc.
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

## PROGRESS
- 2026-06-16: Browser re-verify pass completed (no new responsive defect;
  DSG-1 fix confirmed live). P1 (AGG-8/CF-4 local webServer self-start)
  scheduled and implemented in PROMPT 3. CF-1..CF-3, CF-5 carried forward
  unchanged; D1 deferred with exit criterion. No finding dropped.
</content>
