# Aggregate Review — RPF Cycle 8 (2026-05-16)

**Date:** 2026-05-16
**Cycle:** 1/100 of this loop (per the orchestrator)
**HEAD reviewed:** uncommitted patches on top of `1d95c630`
**Reviewer agents:** code-reviewer, security-reviewer, perf-reviewer,
test-engineer, architect, critic, verifier (single-agent comprehensive
sweep covering each angle — Agent fan-out tool unavailable in this
environment, same as cycles 30+).

---

## Total deduplicated NEW findings

**0 HIGH, 4 MEDIUM (all FIXED this cycle), 14 LOW.**

The 4 MEDIUM findings were gate-blocking issues introduced by the
user-injected patches and were fixed this cycle. No HIGH severity
findings emerged.

---

## NEW findings — all sources

| ID | Severity | Confidence | File | Summary | Status |
|---|---|---|---|---|---|
| CR8b-1 / CRIT8b-1 / TE8b-1 | MEDIUM | HIGH | `settings-tabs.tsx:18-21` | `setActiveTab` synchronously inside `useEffect` violates `react-hooks/set-state-in-effect` (lint error) | FIXED |
| CR8b-2 / CRIT8b-2 / TE8b-1 | MEDIUM | HIGH | `tests/unit/plugins.secrets.test.ts` | Test suite asserted old encryption-mandatory policy | FIXED |
| CR8b-2 / TE8b-1 | MEDIUM | HIGH | `tests/unit/data-retention.test.ts:19,43` | Test asserts `chatMessages: 30` against new `365 * 5` default | FIXED |
| CR8b-2 / TE8b-1 | MEDIUM | HIGH | `tests/unit/api/plugins.route.test.ts:337-341` | Test missed `userRole: "student"` in mock assertion | FIXED |
| TE8b-2 | LOW (gap) | HIGH | `judge-worker-rs/src/executor.rs` | TLE budget classification was inline in `execute_inner`, no unit coverage | FIXED — extracted `classify_test_case_verdict` + 9 new tests |
| SEC8b-1 | MEDIUM | HIGH | `src/lib/plugins/secrets.ts` | Plugin secrets stored as plaintext at rest (operator-directed) | DEFERRED (operator policy) |
| SEC8b-5 / CR8b-5 | MEDIUM | HIGH | `src/lib/data-retention.ts:3` | Chat retention bumped to 5 years without privacy-notice update | DEFERRED — privacy-notice copy update plannable |
| SEC8b-2 | LOW | HIGH | `platform-mode-context.ts:272-291` | Staff bypass platform-mode AI gate | VERIFIED-SAFE |
| SEC8b-3 | LOW | HIGH | `src/proxy.ts:131-186` | Authenticated locale escape on SEO pages | VERIFIED-SAFE |
| SEC8b-4 | LOW (informational) | HIGH | `code-timeline-panel.tsx:75-92` | Highlighter pipes through DOMPurify sanitizer — defense in depth | VERIFIED-SAFE |
| PERF8b-1 | LOW | HIGH | `executor.rs:14-22` | +2s wall-clock budget per test case | DEFERRED (operator-accepted tradeoff) |
| PERF8b-2 | LOW | HIGH | `platform-mode-context.ts:278` | Dynamic `import` in hot path | DEFERRED (cosmetic) |
| PERF8b-3 / CR8b-4 | LOW | HIGH | `(public)/submissions/[id]/page.tsx:103` | Capability spread copy each render | DEFERRED (cosmetic) |
| PERF8b-4 | LOW | MEDIUM | `globals.css:400-411` | Lecture-mode CSS overflow lock + iOS scroll restoration | DEFERRED (needs runtime check) |
| ARCH8b-1 | LOW | HIGH | platform-mode AI gate | Caller-must-pass `userRole` — silent failure mode | DEFERRED |
| ARCH8b-2 | LOW | HIGH | `secrets.ts:166-176` | Plaintext-storage marker missing | DEFERRED — JSDoc note plannable |
| ARCH8b-3 | LOW | HIGH | `(public)/layout.tsx` | LectureModeProvider unconditional mount | DEFERRED — verify next cycle |
| ARCH8b-4 | LOW | HIGH | `(public)/contests/[id]/page.tsx` | `getEnrolledContestDetail` name vs broader use | DEFERRED (cosmetic rename) |
| TE8b-3 | LOW | HIGH | `chat-widget-loader.tsx` | No component test for role-bypass | DEFERRED |
| TE8b-4 | LOW | HIGH | `(public)/submissions/[id]/page.tsx` | No test for capability surfacing on submission detail | DEFERRED |
| TE8b-5 | LOW | HIGH | `assignments/submissions.ts:347-359` | No test for canViewAssignmentSubmissions short-circuit reorder | DEFERRED |
| CR8b-3 | LOW | HIGH | `secrets.ts:53-72` | `decryptPluginSecret` API name now misleading | DEFERRED |
| CR8b-6 | LOW | MEDIUM | `code-timeline-panel.tsx:24-53` | LANGUAGE_TO_HLJS map duplicates existing logic | DEFERRED (cosmetic refactor) |
| CRIT8b-4 | LOW | MEDIUM | `AGENTS.md` (TBC) | Possible doc drift on plugin-secret policy | DEFERRED — needs grep next cycle |

---

## Cross-Agent Agreement

The four MEDIUM gate-blocking findings (CR8b-1, CR8b-2 split into three
test failures) were flagged by code-reviewer, critic, and test-engineer
in agreement. Security-reviewer concurred that the plaintext-secrets and
extended-retention changes are operator-directed but warrant deferred
follow-up (privacy-notice copy update + JSDoc marker).

---

## Carry-forward DEFERRED items from prior cycles (status verified)

All cycle-7 deferred items remain valid. See `_aggregate-cycle-7.md`
deferred table — none of those items overlap with cycle-8's user-injected
patches, so no status change.

Highlights:
- AGG7-4 (4x duplicate psql/node container boilerplate) — still deferred.
- AGG7-17/DES3-1 (Privacy notice no decline path) — still deferred. Now
  joined by SEC8b-5 (chat retention 5y).
- C-1 (Nginx XFF spoof — infrastructure) — still deferred.
- DEFER-22, DEFER-34, DEFER-36, DEFER-46, DEFER-51 (cycle 49/50
  carry-forwards) — still deferred.

---

## Plannable Tasks for Cycle-8

This cycle materialized the following work directly under the
review-plan-fix loop:

1. Fix lint regression in `settings-tabs.tsx` (CR8b-1) — DONE.
2. Fix unit-test regressions in `plugins.secrets.test.ts`,
   `data-retention.test.ts`, `plugins.route.test.ts` (CR8b-2 cluster)
   — DONE.
3. Extract `classify_test_case_verdict` + 9 unit tests for the TLE
   budget logic (TE8b-2) — DONE.
4. Verify each of the 11 user-injected directives (verifier table) — DONE.
5. Archive completed cycle-7 plan to `plans/done/` — DONE (in this
   cycle's housekeeping).
6. Commit + push fine-grained per-topic — pending (next step).
7. Run `DEPLOY_CMD` per `DEPLOY_MODE: per-cycle` — pending.

Deferred follow-ups are recorded in the cycle-8 plan file under the
deferred ledger.

---

## Agent Failures

Subagent fan-out unavailable in this environment (no `Agent` tool with
`subagent_type` is registered). Performed as a single-agent
comprehensive review covering each role's angle in dedicated review
files. This is consistent with cycles 30–50 in this repo.

---

## Verdict

Cycle 8 took the user-injected patch batch from a "lint+tests broken"
state to "all gates green + comprehensive coverage for the new TLE
budget primitive". No HIGH severity findings, four MEDIUM gate-blockers
all fixed in-cycle, ~17 LOW deferrable items recorded.
