# Code Reviewer — Function-Judging Feature (cycle 1, 2026-06-16)

Scope: `src/lib/judge/function-judging/**`, function authoring/submit UI, API routes.

## Findings

### CR-1 (Medium) `mapCompileError` `:(\d+):` regex over-matches non-line column refs
File: `src/lib/judge/function-judging/error-mapping.ts:26`
The `:(\d+):` replacement shifts ANY `:N:` token in compiler output, not just file:line:col references. Compiler diagnostics or student `print`/log lines that contain time-like tokens (`12:34:`) or ratios get their middle number shifted by `preludeLineCount`, corrupting student-visible output. Failure scenario: a C++ error message embedding `note: candidate: 'foo(int):12:'` or any user string with `:7:` mutates. Confidence: Medium. Fix: anchor to file-extension-prefixed forms (e.g. `\.(cpp|java|go|cs|ts|js|py):(\d+):(\d+):`) or only rewrite when preceded by a filename token.

### CR-2 (Low) C++/Java double writer uses locale-sensitive `%.10g`
File: `adapters/cpp.ts:115`, `adapters/java.ts:176`
`snprintf(..., "%.10g", v)` (C++) and `String.format("%.10g", v)` (Java, default locale) emit a comma decimal separator under some locales, breaking JSON. C# correctly uses `CultureInfo.InvariantCulture`. `double`/`double[]` are DEFERRED from authorable types (types.ts:20), so not reachable in v1, but the latent bug should be fixed before v1.1 re-enables doubles. Confidence: High (latent). Fix: C++ `setlocale(LC_ALL,"C")` or manual formatting; Java `String.format(Locale.ROOT, ...)`.

### CR-3 (Low) `decodeValue` ignores its type param and trusts JSON.parse
File: `serialization.ts:25`
`decodeValue(s, _t)` does a bare `JSON.parse` with no shape/type validation; callers (`function-test-case-editor.hydrateFields`) wrap in try/catch and fall back to blank, so impact is limited to the editor. Confidence: High. Acceptable for v1 but document the trust boundary.

### CR-4 (Low) `formatValue` for non-array number leaks JS `String()` form
File: `value-fields.ts:196`
For scalar `int/long`, `formatValue` returns `String(value)`; if `decodeValue` returns a float (e.g. `1.0`) it round-trips as `1` — fine. No action.

## Positives
- Reference solution correctly stripped from student reads (`api/v1/problems/[id]/route.ts:70`).
- `preludeLineCount` recomputed, never stored (assemble.ts) — no drift risk.
- Safe-integer guard on int/long authoring (value-fields.ts:28).

---

## Cycle 3 (2026-06-16) re-confirmation + new

### AGG-8 (Low, NEW this cycle) local Playwright webServer cannot self-start
- `playwright.config.ts:81` — `JUDGE_AUTH_TOKEN ?? "playwright-local-token-for-
  smoke"`; the fallback equals `JUDGE_AUTH_TOKEN_PLAYWRIGHT_PLACEHOLDER`
  (`src/lib/security/env.ts:6`), rejected by `getValidatedJudgeAuthToken()`
  (env.ts:223-229) → app throws at boot when no strong token is exported.
- `scripts/playwright-local-webserver.sh:45` runs `next start` while
  `next.config.ts:9` sets `output: "standalone"` (Next 16.2.3) — not the
  standalone serve path; the build emits `.next/standalone/server.js`.
- Failure: a contributor running `npx playwright test` with no `JUDGE_AUTH_TOKEN`
  cannot bring the app up → e2e gate unrunnable locally. Fix THIS RUN: mint a
  strong ephemeral token in the script, drop the placeholder fallback in the
  config, serve the standalone `server.js`. Confidence High.

### Re-confirmed carry-forward (unchanged severity)
- CR-1 / AGG-2 (Medium) `error-mapping.ts:26` `:(\d+):` over-match — still present.
- CR-2 / AGG-3 (Medium) cross-language string escaping divergence — still present.
- AGG-4 (Medium) `serialization.ts` single-line stdin contract unasserted — still
  present.

### Browser-verified clean (designer angle)
- The three function-judging UI components are responsive-clean at mobile/tablet/
  desktop in light + dark; no state-handling regressions on re-read.
