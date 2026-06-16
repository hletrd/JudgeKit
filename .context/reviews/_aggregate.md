# Aggregate Review — cycle 3 (2026-06-16)

Multi-perspective review focused on the `function` problem type (LeetCode-style
function-signature judging) and its authoring + student UI. The designer review
was browser-driven (`agent-browser` 0.22.2, Chromium headless) at mobile 375 /
tablet 768 / desktop 1280, light + dark, against a live `next dev` server backed
by a freshly seeded Postgres and a real function problem minted via the
authenticated API — the user's primary focus this run.

## METHODOLOGY NOTE (agent fan-out)
No nested subagent dispatch tool is registered in this environment (this cycle
runs as a single `general-purpose` agent; there is no Agent/Task spawn tool with
a schema to fan out into parallel reviewer subagents). Each specialist angle was
executed directly by the cycle agent, with the designer angle driving a real
browser. Per-angle provenance files remain under `.context/reviews/<angle>.md`.
No reviewer angle was dropped.

## NEW THIS CYCLE

### AGG-8 (Low) Local Playwright webServer cannot self-start — token rejected + `next start` wrong for standalone — RE-CONFIRMED, SCHEDULED + FIXED THIS RUN
Two coupled defects in the local-only Playwright bring-up (carry-forward CF-4 =
old AGG-6/AGG-7), re-confirmed by reading live code this cycle and FIXED this run
because they block the very harness the e2e gate (and this run's browser pass)
depend on:
- `playwright.config.ts:81` falls back to `JUDGE_AUTH_TOKEN ??
  "playwright-local-token-for-smoke"`, which is byte-identical to
  `JUDGE_AUTH_TOKEN_PLAYWRIGHT_PLACEHOLDER` (`src/lib/security/env.ts:6`) and is
  REJECTED by `getValidatedJudgeAuthToken()` (env.ts:223-229). So when the
  operator has no strong `JUDGE_AUTH_TOKEN` exported, the local webServer throws
  at startup and `npx playwright test` cannot bring the app up at all.
- `scripts/playwright-local-webserver.sh:45` runs `npm run start` = `next start`
  (package.json:8), but `next.config.ts:9` sets `output: "standalone"`. Under
  Next 16.2.3 standalone output, `next start` is not the supported serve path
  (the build emits `.next/standalone/server.js`); serving must launch that
  entrypoint with the right `PORT`/`HOSTNAME`.
Severity Low (local-tooling only, no production impact) but actionable and
already scheduled (CF-4). FIX THIS RUN: mint a strong ephemeral token in the
webServer script when none is provided, drop the placeholder fallback in
playwright.config.ts, and serve the standalone `server.js`.

## CARRIED FORWARD (re-confirmed still real this cycle; no severity change)
- AGG-2 (Medium) `mapCompileError` `:(\d+):` regex over-matches non-line tokens
  (`error-mapping.ts:26`). Re-confirmed by re-reading: the second
  `.replace(/:(\d+):/g, ...)` still shifts ANY `:N:` token (e.g. a `12:5` column
  pair or an unrelated `:8:` in a path/message), not only `file:line:col`.
  Scheduled (plan CF-1).
- AGG-3 (Medium) Cross-language string-escaping divergence. Re-confirmed:
  `string`/`string[]` ARE authorable (only `double`/`double[]` excluded,
  `types.ts:20`). C++/Java escape only `" \ \n \t \r` and emit `< > &` / non-ASCII
  raw; Go uses `json.Marshal` which escapes `< > &` as `\uXXXX`. In `exact` mode a
  string-returning problem judged across languages diverges. Scheduled (CF-2).
- AGG-4 (Medium) Implicit single-line stdin contract across the adapters.
  Re-confirmed: `encodeArgs`/`encodeValue` (`serialization.ts:18,22`) join with
  no newline but nothing asserts the output is newline-free; a future string
  value carrying `\n` would silently break the one-line stdin protocol.
  Scheduled (CF-3).
- P8/low cleanups (SEC-3 host-path trim, PERF-1 compute-expected concurrency,
  ARC-4 shared resolveExecLanguage, DBG-4 confirm-on-param-removal, TST-3/TST-4
  serialization fuzz + student-GET referenceSolution-absence). Scheduled (CF-5).

## RESOLVED / NOT RE-OPENED
- DSG-1 (cycle 2, Medium) active-tab clipping on the overflowing student tab bar
  — VERIFIED FIXED LIVE this cycle (see designer.md: `flex-start`,
  `notClippedLeft=true`, `fullyVisible=true` at mobile 375). No re-open.
- AGG-5 (cycle 2, Medium) seed.ts FK ordering — fixed cycle 2; re-verified this
  cycle on a fresh DB (`seed` printed "Seeded built-in roles" before the super
  admin user; 5 roles + 1 super_admin present). No re-open.

## DEFERRED (severity preserved, exit criterion stated — see plan D1)
- D1 / CR-2 / VER-3 (Low, latent) Locale-sensitive double printers (C++ `%.10g`,
  Java `String.format("%.10g")`) in `adapters/cpp.ts:115`, `adapters/java.ts:176`.
  Unreachable in v1 because `double`/`double[]` are excluded from
  `AUTHORABLE_FUNCTION_TYPES` (`types.ts:20`), documented as deferred to v1.1
  (types.ts:11-22) — the repo's own design note is the authority permitting the
  deferral. Exit criterion: re-open and fix (force `"C"` locale / `Locale.ROOT`)
  with a cross-locale double golden test BEFORE re-enabling authorable double.

## AGENT FAILURES
None. (Subagent dispatch is unavailable in this environment; see methodology
note. Reviews were produced directly, one provenance file per angle, with the
designer angle browser-driven.)
</content>
