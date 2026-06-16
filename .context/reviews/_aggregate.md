# Aggregate Review — cycle 1 (2026-06-16)

Multi-perspective review of the recently-shipped `function` problem type
(LeetCode-style function-signature judging) and its authoring + student UI.
Reviews were performed across specialist angles (code-reviewer, security,
perf, critic, verifier, test-engineer, tracer, architect, debugger,
document-specialist, designer). The designer review was browser-driven
(Playwright, chromium) at mobile 375 / tablet 768 / desktop 1280 against a live
`next dev` server — the user's primary focus this run.

## METHODOLOGY NOTE (agent fan-out)
No nested subagent dispatch tool is registered in this environment (only a
task-list tool), so the specialist reviews were executed directly by the cycle
agent rather than as parallel subagents. Each angle still produced its own
provenance file under `.context/reviews/<angle>.md`. No reviewer angle was
dropped.

## HIGH-SIGNAL / CROSS-AGENT FINDINGS

### AGG-1 (High) Student problem tab bar overflows mobile viewport — RESPONSIVE DEFECT
Agents: designer (live, confirmed), critic.
`/practice/problems/[id]` overflows at 375px (doc 422px vs 375px, +47px). Cause:
`tabsListVariants` (`src/components/ui/tabs.tsx:27`) uses `inline-flex w-fit ...
overflow-x-auto scrollbar-none` with no width cap, so the 4-tab list grows to
406px and `overflow-x-auto` never engages. Fix: add `max-w-full`. THIS RUN:
fix + cover with the new responsive spec. Severity High (visible page-level
horizontal scroll on the primary student surface).

### AGG-2 (Medium) mapCompileError `:(\d+):` regex over-matches non-line tokens
Agents: code-reviewer (CR-1), debugger (DBG-1), test-engineer (TST-2).
`src/lib/judge/function-judging/error-mapping.ts:26` shifts ANY `:N:` token, not
just file:line:col, corrupting student-visible compiler/runtime output that
contains time-like or ratio tokens. Fix: only rewrite `:N:` when preceded by a
source-filename token; add a regression unit test.

### AGG-3 (Medium) Cross-language string-escaping divergence in harness writers
Agents: tracer (Hypothesis A), critic, document-specialist (DOC-3).
Each language's JSON string writer escapes a different set: C++/Java escape only
`" \ \n \t \r` and emit other bytes (incl. non-ASCII, `<`,`>`,`&`) raw, while Go's
`encoding/json` escapes `<,>,&` as `\uXXXX`. For a `string`/`string[]`-returning
problem judged in `exact` mode, a correct student solution in language A can be
marked WRONG_ANSWER vs an expected output computed in language B. Fix: define a
single canonical string-escaping contract and a cross-language golden test.
(Affects string-returning problems only.)

### AGG-4 (Medium) Single-line stdin contract is implicit across all 7 adapters
Agents: debugger (DBG-2), architect (ARC-1), document-specialist (DOC-2).
Every harness reads exactly one stdin line and `JSON.parse`s it; correct today
because `encodeArgs` emits compact single-line JSON, but undocumented and
unasserted. Fix: assert no-newline in `encodeArgs` output and document the
invariant.

## MEDIUM / LOW FINDINGS (single-agent, scheduled or deferred)
- CR-2/VER-3 (Low, latent): C++ `snprintf("%.10g")` + Java `String.format("%.10g")`
  double printers are locale-sensitive; `double` is deferred from authorable
  types so unreachable in v1. Re-open before v1.1 re-enables double. (C# already
  uses InvariantCulture.)
- SEC-3 (Medium): compute-expected echoes raw stderr/compileOutput (may include
  host paths) to the author client. Author-only; trim host paths.
- PERF-1 (Low): compute-expected runs test cases serially; bounded by case count,
  author-only. Optional concurrency cap.
- DBG-4 (Low): FunctionTestCaseEditor silently drops typed args when a param is
  removed. Consider a confirm.
- ARC-4 (Low): compute-expected duplicates language-config resolution from the
  compiler/run route; extract a shared helper.
- TST-1 (High, THIS RUN): no responsive render e2e for function authoring +
  submit UI — ADDRESSED this run via tests/e2e/function-judging-responsive.spec.ts.
- TST-3/TST-4 (Low): add serialization round-trip fuzz for adversarial string[]
  and an integration test asserting referenceSolution absence on student GET.

## OPERATIONAL FINDINGS (discovered while standing up the live review)
### AGG-5 (Medium) seed.ts inserts the admin user before built-in roles → FK violation on a fresh DB
`scripts/seed.ts:179` inserts the super-admin user (FK `users.role ->
roles.name`) BEFORE the roles are inserted at line 215. On a truly empty DB with
the FK enforced this fails with `users_role_roles_name_fk` (reproduced this run).
Fix: seed built-in roles before the admin user. Severity Medium (breaks
first-time local/CI bootstrap on an empty DB; may be masked when roles
pre-exist).

### AGG-6 (Low) Playwright local webServer cannot seed — JUDGE_AUTH_TOKEN placeholder is rejected
`playwright.config.ts` passes `JUDGE_AUTH_TOKEN=playwright-local-token-for-smoke`
to the local webServer, but `getValidatedJudgeAuthToken`
(`src/lib/security/env.ts:226`) explicitly rejects that exact placeholder, so
`npm run seed` throws during webServer startup. The placeholder constant exists
(env.ts:6) but is only listed in the REJECT branch, never in an allow path. Fix:
either allow the playwright placeholder when not in production, or have the
webServer script mint a strong token.

### AGG-7 (Low) Local webServer uses `next start` which no-ops under output:standalone
`next.config.ts` hardcodes `output: "standalone"`; `scripts/playwright-local-webserver.sh`
runs `npm run start` (`next start`), which prints "does not work with output:
standalone" and exits without serving, so the local Playwright webServer never
comes up via the documented path. Fix: serve via `node .next/standalone/server.js`
(copying static/public) or run `next dev` for the local test server.

## AGENT FAILURES
None. (Subagent dispatch is unavailable in this environment; see methodology
note. Reviews were produced directly, one provenance file per angle.)
