# Test Engineer — coverage gaps (cycle 1, 2026-06-16)

### TST-1 (High, THIS RUN FOCUS) No responsive/render e2e for function authoring + submit UI
`tests/e2e/function-judging.spec.ts` is API-only (create→compute→judge→verdict) and needs a judge worker. `responsive-layout.spec.ts` covers only public pages. There is NO Playwright spec that loads `problems/create` / `problems/[id]/edit` with problemType=function or the student submit page and asserts no horizontal overflow / usable controls at mobile(375)/tablet(768)/desktop(1280). GAP. Action: add `function-judging-responsive.spec.ts` (no worker needed).

### TST-2 (Medium) No unit test for mapCompileError over-match (CR-1)
Add a regression test feeding output with a non-line `:N:` token and asserting it is NOT shifted, once CR-1 is fixed.

### TST-3 (Low) serialization round-trip not property-tested for string[] with commas/quotes/newlines
`value-fields` + `serialization` have golden cases but no fuzz/round-trip for adversarial string elements (`"a,b"`, `"x\"y"`, `"l\nm"`). Add round-trip unit coverage.

### TST-4 (Low) No test asserting reference solution absence on student GET
Add an integration test: student fetch of a function problem must not include `referenceSolution`.
