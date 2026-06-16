# Aggregate Review — cycle 2 (2026-06-16)

Multi-perspective review focused on the `function` problem type (LeetCode-style
function-signature judging) and its authoring + student UI. The designer review
was browser-driven (`agent-browser`, Chromium headless) at mobile 375 / tablet
768 / desktop 1280 against a live `next dev` server seeded with a real function
problem — the user's primary focus this run.

## METHODOLOGY NOTE (agent fan-out)
No nested subagent dispatch tool is registered in this environment (this cycle
itself runs as a single `general-purpose` agent; there is no Agent/Task spawn
tool with a schema to fan out into parallel reviewer subagents). Each specialist
angle was therefore executed directly by the cycle agent, with the designer
angle driving a real browser. Per-angle provenance files remain under
`.context/reviews/<angle>.md`. No reviewer angle was dropped.

## NEW THIS CYCLE

### DSG-1 (Medium, High-confidence) Active/first problem tab clipped on overflowing tab bar — RESPONSIVE DEFECT
Agent: designer (live, confirmed). `src/components/ui/tabs.tsx:27`
(`tabsListVariants`) pairs `justify-center` with `overflow-x-auto`. On
`/practice/problems/[id]` at mobile 375 the 4-tab bar overflows its `max-w-full`
cap; `justify-center` then centres the overflow, so the first/ACTIVE tab renders
at `offsetLeft=-13` (clipped left of the list content box) while `scrollLeft=0`
is already the left scroll limit → the active tab's label is permanently
truncated and unreachable. In-browser fix proof: `justify-content:flex-start`
moves `offsetLeft -13 → 19`, makes the active tab fully visible, and the list
still scrolls (`scrollWidth 406 > clientWidth 343`). Desktop (`w-fit`,
non-overflowing) is unaffected by the change (`firstOffsetLeft=99` identical).
THIS RUN: fix (`justify-center` → `justify-start`) + extend the responsive spec
with a tab-clipping regression guard. Slips past the existing page-overflow
guard because `documentWidth == viewportWidth` (the page does not scroll; only
the tab content is clipped within the scrolled list).

### AGG-5 RE-CONFIRMED LIVE (Medium) seed.ts FK ordering — admin user before roles
Reproduced this run during local server bring-up: `npm run seed` on a truly
empty DB failed with `users_role_roles_name_fk` because `scripts/seed.ts`
inserted the super-admin user (FK `users.role -> roles.name`, onDelete:restrict,
schema.pg.ts:34) BEFORE the built-in roles. Scheduled as P6 in the cycle-1 plan;
fixed THIS RUN (roles now seeded first) and verified (fresh-DB seed succeeds, 5
roles + 1 super_admin present). Not deferrable (breaks first-time bootstrap).

## CARRIED FORWARD (confirmed still real; scheduled in plan/cycle-1-rpf-... — no new severity change)
- AGG-2 (Medium) `mapCompileError` `:(\d+):` regex over-matches non-line tokens
  (`error-mapping.ts:26`). Scheduled P3. Re-confirmed by re-reading: the second
  `.replace(/:(\d+):/g, ...)` still shifts ANY `:N:` token.
- AGG-3 (Medium) Cross-language string-escaping divergence. Re-confirmed:
  `string`/`string[]` ARE authorable (only `double`/`double[]` excluded, types.ts
  :20). C++ (cpp.ts:117-130) and Java (java.ts:178-192) escape only `" \ \n \t \r`
  and emit non-ASCII / `<` `>` `&` raw; Go uses `json.Marshal` (go.ts:92) which
  escapes `<>&` as `\uXXXX`. In `exact` mode a string-returning problem judged
  across languages diverges. Scheduled P4.
- AGG-4 (Medium) Implicit single-line stdin contract across 7 adapters.
  Scheduled P5.
- AGG-6 (Low) Playwright local webServer placeholder `JUDGE_AUTH_TOKEN` rejected
  by `getValidatedJudgeAuthToken` (env.ts:223-227 still lists the playwright
  placeholder only in the REJECT branch). Scheduled P7.
- AGG-7 (Low) Local webServer uses `next start`, which no-ops under
  `output:standalone`. Scheduled P7. (Worked around this run by serving via
  `next dev` for the browser review.)
- P8 low cleanups (SEC-3 host-path trim, PERF-1 compute-expected concurrency,
  ARC-4 shared resolveExecLanguage, DBG-4 confirm-on-param-removal, TST-3/TST-4
  serialization fuzz + student-GET referenceSolution-absence). Scheduled P8.

## DEFERRED (severity preserved, exit criterion stated — see plan D1)
- D1 / CR-2 / VER-3 (Low, latent) Locale-sensitive double printers (C++ `%.10g`,
  Java `String.format("%.10g")`) in `adapters/cpp.ts:115`, `adapters/java.ts:176`.
  Unreachable in v1 because `double`/`double[]` are excluded from
  `AUTHORABLE_FUNCTION_TYPES` (types.ts:20), documented as deferred to v1.1
  (types.ts:11-22) — the repo's own design note is the authority permitting the
  deferral. Exit criterion: re-open and fix (force `"C"` locale / `Locale.ROOT`)
  with a cross-locale double golden test BEFORE re-enabling authorable double.

## AGENT FAILURES
None. (Subagent dispatch is unavailable in this environment; see methodology
note. Reviews were produced directly, one provenance file per angle, with the
designer angle browser-driven.)
