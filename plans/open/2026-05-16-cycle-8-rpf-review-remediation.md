# Cycle 8 RPF Review Remediation Plan

**Date:** 2026-05-16
**Cycle:** 1/100 of this loop
**Aggregate:** `.context/reviews/_aggregate-cycle-8-2026-05-16.md`
**Per-agent reviews:** `.context/reviews/{code-reviewer,security-reviewer,perf-reviewer,test-engineer,architect,critic,verifier}-cycle-8-2026-05-16.md`

---

## Summary

The user-injected patch batch (chat widget admin bypass, contest manage
view, TLE overhead budget, plaintext plugin secrets, locale switcher
authenticated-bypass, code timeline syntax highlighting, button height
normalization, search label nowrap, problem rendering markdown vs HTML
fix, lecture mode wiring, Korean copy polish, contest analytics
ROUND::numeric fix, capability-driven submission detail surfacing) was
applied uncommitted and broke the lint and unit gates. Cycle 8
remediates all gate-blocking issues, adds regression coverage for the
TLE budget classifier, and verifies each user-injected directive.

---

## Implementation tasks

| # | Task | Severity | Status |
|---|---|---|---|
| 1 | Fix lint regression: `setActiveTab` synchronously inside `useEffect` in `settings-tabs.tsx`. Defer initial sync via `queueMicrotask` and skip redundant updates via functional setter. | MEDIUM | [x] |
| 2 | Update `tests/unit/plugins.secrets.test.ts` to assert plaintext-storage policy (verbatim writes, plaintext-by-default decrypt, opt-out path retained). | MEDIUM | [x] |
| 3 | Update `tests/unit/data-retention.test.ts` to expect `chatMessages: 365 * 5`. | MEDIUM | [x] |
| 4 | Update `tests/unit/api/plugins.route.test.ts` to expect `userRole: "student"` in the `isAiAssistantEnabledForContext` mock assertion. | MEDIUM | [x] |
| 5 | Extract `classify_test_case_verdict` pure helper from `executor.rs::execute_inner` and add 9 unit tests covering the new TLE budget branches. | LOW (gap) | [x] |
| 6 | Verify each user-injected directive against the actual code (verifier review). | — | [x] |
| 7 | Archive completed cycle-7 plan to `plans/done/`. | — | [x] |
| 8 | Run all gates (npm run lint, npm run build, npm run test:unit, cargo test --release). | — | [x] |
| 9 | Commit and push in fine-grained chunks per topic. | — | [pending] |
| 10 | Run per-cycle DEPLOY_CMD. | — | [pending] |

---

## Quality gates

- [x] `npm run lint` — PASS
- [x] `npm run build` — PASS
- [x] `npm run test:unit` — 317 files, 2410 tests pass
- [x] `cargo test --release` (judge-worker-rs) — 64 tests pass (was 55)

---

## Deferred ledger (cycle 8)

Per `plans/open/README.md` and the run-context deferred-fix rules,
every still-open finding from `.context/reviews/_aggregate-cycle-8-2026-05-16.md`
is either implemented above or recorded here with severity preserved
and an exit criterion stated. No security/correctness/data-loss item
is deferred without operator policy backing.

| ID | Severity | Confidence | File | Reason for deferral | Exit criterion |
|---|---|---|---|---|---|
| SEC8b-1 | MEDIUM | HIGH | `src/lib/plugins/secrets.ts` | Operator-directed plaintext-storage policy (run context: "API key plaintext policy") | Re-open if operator reverts policy |
| SEC8b-5 / CR8b-5 | MEDIUM | HIGH | `src/lib/data-retention.ts:3` | Operator-directed retention bump; privacy-notice copy update is plannable in next cycle | Privacy-notice copy reflects 5-year chat retention OR retention is reduced |
| PERF8b-1 | LOW | HIGH | `judge-worker-rs/src/executor.rs:14-22` | +2s wall-clock budget per test case is the operator-accepted tradeoff for the "765ms < 1000ms TLE 오인" fix | Re-open if worker fleet shrinks or test counts grow such that throughput drops below SLO |
| PERF8b-2 | LOW | HIGH | `src/lib/platform-mode-context.ts:278` | Cosmetic — dynamic import is cached after first call, deviation likely intentional to break a circular import | Replace with eager import once circular dep resolved |
| PERF8b-3 / CR8b-4 | LOW | HIGH | `src/app/(public)/submissions/[id]/page.tsx:103` | Cosmetic — capability spread copy each render, negligible cost | Refactor to direct iteration if perf review surfaces it |
| PERF8b-4 | LOW | MEDIUM | `src/app/globals.css:400-411` | Needs runtime check on iOS Safari for scroll restoration interaction | Verified on iOS or alternate strategy adopted |
| ARCH8b-1 | LOW | HIGH | `platform-mode-context.ts` AI gate | Cosmetic API hardening — current callers explicit, future-proofing | Typed caller argument or `userRole`-less form deprecation |
| ARCH8b-2 | LOW | HIGH | `secrets.ts:166-176` | Add explicit `// @policy: plaintext` JSDoc marker | Marker present in source |
| ARCH8b-3 | LOW | HIGH | `(public)/layout.tsx` | Verify `LectureModeProvider` is a pure client component | Confirmation in next cycle architect review |
| ARCH8b-4 | LOW | HIGH | `(public)/contests/[id]/page.tsx` | Cosmetic rename: `getEnrolledContestDetail` → `getParticipationContestDetail` | Rename or doc-comment update |
| TE8b-3 | LOW | HIGH | `chat-widget-loader.tsx` | No regression test for role-bypass; loader is thin | Component test covering admin role |
| TE8b-4 | LOW | HIGH | `(public)/submissions/[id]/page.tsx` | No test for capability surfacing | Integration test asserting rejudge action visible to instructor |
| TE8b-5 | LOW | HIGH | `assignments/submissions.ts:347-359` | No test for canViewAssignmentSubmissions short-circuit reorder | Unit test covering admin without assignmentId |
| CR8b-3 | LOW | HIGH | `secrets.ts:53-72` | API name `decryptPluginSecret` now misleading; cosmetic | Rename or JSDoc clarification |
| CR8b-6 | LOW | MEDIUM | `code-timeline-panel.tsx:24-53` | LANGUAGE_TO_HLJS map likely duplicates `getCodeSurfaceLanguage` | Confirm overlap and consolidate |
| CRIT8b-4 | LOW | MEDIUM | `AGENTS.md` (TBC) | Possible doc drift for plaintext-secret policy | Doc grep + update next cycle |
| All carry-forward defers from `_aggregate-cycle-7.md` | LOW | varies | various | No status change this cycle | Per their original entries |

---

## Progress

- [x] Per-agent reviews written
- [x] Aggregate written
- [x] Plan written
- [x] Lint passes
- [x] Unit tests pass
- [x] Rust tests pass (with new coverage)
- [x] Build passes
- [ ] Committed and pushed
- [ ] Deployed to algo.xylolabs.com (per-cycle)
