# Test Engineer — coverage gaps (cycle 1, 2026-06-16)

### TST-1 (High, THIS RUN FOCUS) No responsive/render e2e for function authoring + submit UI
`tests/e2e/function-judging.spec.ts` is API-only (create→compute→judge→verdict) and needs a judge worker. `responsive-layout.spec.ts` covers only public pages. There is NO Playwright spec that loads `problems/create` / `problems/[id]/edit` with problemType=function or the student submit page and asserts no horizontal overflow / usable controls at mobile(375)/tablet(768)/desktop(1280). GAP. Action: add `function-judging-responsive.spec.ts` (no worker needed).

### TST-2 (Medium) No unit test for mapCompileError over-match (CR-1)
Add a regression test feeding output with a non-line `:N:` token and asserting it is NOT shifted, once CR-1 is fixed.

### TST-3 (Low) serialization round-trip not property-tested for string[] with commas/quotes/newlines
`value-fields` + `serialization` have golden cases but no fuzz/round-trip for adversarial string elements (`"a,b"`, `"x\"y"`, `"l\nm"`). Add round-trip unit coverage.

### TST-4 (Low) No test asserting reference solution absence on student GET
Add an integration test: student fetch of a function problem must not include `referenceSolution`.

---

## Cycle 4 (2026-06-17)

### TST4-1 (Medium, FIXED THIS RUN) function-judging-responsive spec could not authenticate locally
The spec added in TST-1 was effectively dead against the local standalone
harness: `loginAsAdmin` timed out in `beforeAll` because the seeded admin is
`mustChangePassword=true` and the standalone (production-mode) change-password
form's automatic re-sign-in races the just-invalidated session token, stranding
the browser on `/change-password`. All 16 tests failed before any assertion ran.
FIX: clear `must_change_password` for the seeded admin in the disposable local
e2e DB (`scripts/playwright-local-webserver.sh`, after `npm run seed`) + make
`loginAsAdmin` set a DISTINCT strong password if a forced change still appears.
Verified: all 16 tests green at mobile/tablet/desktop. See designer.md DSG4-1.

### TST-2..TST-4 still open (unchanged)
mapCompileError over-match regression test, string[] round-trip fuzz, and the
student-GET referenceSolution-absence integration test remain to be added with
their respective fixes (CF-1, CF-5).
