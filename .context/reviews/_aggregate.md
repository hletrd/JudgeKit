# Aggregate Review — cycle 4 (2026-06-17)

Multi-perspective review focused on the `function` problem type (LeetCode-style
function-signature judging) and its authoring + student UI. The designer review
was browser-driven (Playwright/Chromium headless via the local standalone-server
e2e harness, plus `agent-browser` 0.22.2 for interactive diagnosis) at mobile
375 / tablet 768 / desktop 1280 against a freshly-seeded Postgres + a real
function problem — the user's primary focus this run. All 16 function-judging
responsive assertions are green after this cycle's harness fix.

## METHODOLOGY NOTE (agent fan-out)
No nested subagent dispatch tool with a callable schema is registered in this
environment (team/task tooling exists but no Agent-spawn schema for parallel
reviewer subagents). Each specialist angle was executed directly by the cycle
agent; the designer angle drove a real browser. Per-angle provenance files
remain under `.context/reviews/<angle>.md`. No reviewer angle was dropped.

## NEW THIS CYCLE

### AGG4-1 (Medium) Local e2e auth fully broken — function-judging responsive gate could not run — FIXED THIS RUN
The function-judging responsive gate (and any local full-profile e2e run) could
not authenticate at all. The Next 16 **standalone** local server runs in
`NODE_ENV=production`; the seeded admin is `mustChangePassword=true`
(`scripts/seed.ts:225`); on the forced change the change-password form
(`change-password-form.tsx:51`) commits server-side (sets `tokenInvalidatedAt`)
then immediately re-`signIn`s — under the Playwright runner's tight timing that
re-auth races the just-invalidated token and strands the browser on
`/change-password` even though `must_change_password` already flipped to `false`
in the DB. Every `loginAsAdmin` timed out → all 16 responsive tests failed in
`beforeAll`. The spec's old helper also set new==current password, worsening the
race. FIX THIS RUN: (a) `scripts/playwright-local-webserver.sh` clears
`must_change_password` for the seeded admin in the disposable local DB after
`npm run seed` (production seed semantics untouched); (b)
`function-judging-responsive.spec.ts` `loginAsAdmin` now sets a DISTINCT strong
policy-compliant password if a forced change still appears and tracks it for the
run. Verified: all 16 tests green at all three viewports. Severity Medium
(local-tooling only; no production impact) but it had silently disabled the very
gate this run enforces. Confidence High.

## CARRIED FORWARD (re-confirmed still real this cycle; no severity change)
- AGG-2 (Medium) `mapCompileError` `:(\d+):` regex over-matches non-line tokens
  (`error-mapping.ts:26`). The bare `:N:` rewrite shifts any `:N:` (column pair,
  path/message segment), not only `file:line:col`. Scheduled (plan CF-1).
- AGG-3 (Medium) Cross-language string-escaping divergence — re-confirmed AND
  WIDENED: `string`/`string[]` are authorable; expected is computed in ONE
  reference language then compared against ANY student language. C++/Java emit
  `<>&`/non-ASCII raw; Go `json.Marshal` escapes `<>&`; Python `json.dumps`
  (default `ensure_ascii=True`) escapes ALL non-ASCII to `\uXXXX`; JS/TS keep all
  raw. A `string`-returning problem judged cross-language WRONG-ANSWERs correct
  code on `<`,`>`,`&`, or any non-ASCII. Scheduled (CF-2).
- AGG-4 (Medium) Implicit single-line stdin contract unasserted
  (`serialization.ts:18,22`). Scheduled (CF-3).
- P8/low cleanups (SEC-3 host-path trim, PERF-1 compute-expected concurrency,
  ARC-4 shared resolveExecLanguage, DBG-4 confirm-on-param-removal, TST-3/TST-4
  serialization fuzz + student-GET referenceSolution-absence). Scheduled (CF-5).

## RESOLVED / NOT RE-OPENED
- DSG-1 (cycle 2, Medium) active-tab clipping on the overflowing student tab bar
  — re-VERIFIED FIXED LIVE this cycle (the responsive spec's tab-bar guard
  passes at mobile 375). No re-open.
- AGG-8 (cycle 3, Low) local Playwright webServer self-start — FIXED cycle 3 and
  re-verified this cycle: the standalone server boots with minted strong secrets
  and serves the responsive spec. No re-open.

## DEFERRED (severity preserved, exit criterion stated — see plan D1)
- D1 / CR-2 / VER-3 (Low, latent) Locale-sensitive double printers (C++ `%.10g`,
  Java `String.format("%.10g")`) in `adapters/cpp.ts:115`, `adapters/java.ts:176`.
  Unreachable in v1 because `double`/`double[]` are excluded from
  `AUTHORABLE_FUNCTION_TYPES` (`types.ts:20`), documented as deferred to v1.1
  (`types.ts:11-22`) — the repo's own design note is the authority permitting the
  deferral. Exit criterion: re-open and fix (force `"C"` locale / `Locale.ROOT`)
  with a cross-locale double golden test BEFORE re-enabling authorable double.

## OBSERVATIONS (not new scheduled work)
- change-password local-prod re-auth race (the mechanism behind AGG4-1) only
  triggers under the standalone production server with a forced first-login
  change AND a near-instant automated re-auth — not a human-facing path
  (recorded in designer.md). No app change scheduled; revisit only if it recurs
  for real users.

## AGENT FAILURES
None. (Subagent dispatch is unavailable in this environment; see methodology
note. Reviews produced directly, one provenance file per angle, designer angle
browser-driven.)
