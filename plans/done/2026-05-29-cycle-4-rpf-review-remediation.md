# Cycle 4 RPF Review Remediation Plan

**Date:** 2026-05-29
**Cycle:** 4/100 of this RPF loop (orchestrator-numbered)
**Aggregate:** `.context/reviews/_aggregate.md` (cycle-4) + `_aggregate-cycle-4.md`
**Per-agent reviews:** `.context/reviews/cycle-4-2026-05-29/{code-reviewer,perf-reviewer,security-reviewer,critic,verifier,test-engineer,tracer,architect,debugger,document-specialist,designer}.md`
**Prior-cycle aggregates preserved:** `.context/reviews/_aggregate-cycle-3.md`, `_aggregate-cycle-2-2026-05-29.md`, `_aggregate-cycle-1-2026-05-29.md`

---

## Summary

Cycle 4 broadened the review off the email/SMTP surface onto the judge worker,
rate limiter, contests, auth/session, DB/drizzle, and scripts (per orchestrator
guidance). Baseline is fully green (lint 0/0, tsc 0, test:unit 319 files / 2445
tests, lint:bash 0).

**2 net-new actionable findings (both implement now), 3 deferred (severity
preserved).** All Low severity; no High/Critical, no data-loss, no remote-exploit.

1. **F1 — IPv4-mapped IPv6 client IP is rejected** (Low; 7-angle agreement; NOT
   deferrable — correctness + worker availability). `isValidIp`
   (`src/lib/security/ip.ts`) rejects `::ffff:a.b.c.d`, so `extractClientIp`
   returns null in production for it → `isJudgeIpAllowed` denies the worker (queue
   stall) and rate-limit keys coarsen. Asymmetric with `ip-allowlist.ts:ipv6ToBytes`
   which DOES parse the mapped form. Fix: normalize the mapped form to its dotted
   IPv4 in `extractClientIp` (and accept it in `isValidIp`), add tests.
2. **F2 — `findSessionUser` not-found sentinel asymmetry** (Low; 4-angle
   agreement; NOT deferrable — correctness). Returns `undefined` where its paired
   sibling returns `null`. Fix: append `?? null` on both branches, update doc,
   add a test.

Deferred (ledger below, severity preserved): **F3** (worker result trust:
testCaseId scoping + partial-result score — gated by the trusted-worker boundary),
**F4** (triple worker SELECT on claim path — perf-only).

---

## Implementation tasks

| # | Task | Severity | Status |
|---|---|---|---|
| 1 | In `src/lib/security/ip.ts`, normalize IPv4-mapped IPv6 in `extractClientIp`: before returning a candidate (and inside `isValidIp`), if the value matches `^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$` (case-insensitive on `ffff`) and the dotted tail is a valid IPv4, treat/return it as that IPv4. Keep all existing behavior for plain IPv4 and pure-hex IPv6. | LOW (F1 / SEC-C4-1) — NOT DEFERRABLE | [x] commit 90f1b2e2 |
| 2 | Add tests to `tests/unit/security/ip.test.ts`: `extractClientIp` returns the unwrapped IPv4 for XFF `"::ffff:198.51.100.8, 203.0.113.10"` and X-Real-IP; rejects an out-of-range mapped tail; `isValidIp` accepts the mapped form. | LOW (F1 / TE-C4-1) | [x] commit 90f1b2e2 |
| 3 | Add tests to `tests/unit/judge/ip-allowlist.test.ts`: a mapped client IP (`::ffff:10.0.0.5`) matches an exact IPv4 entry and `::ffff:192.168.1.42` matches an IPv4 CIDR range once F1 normalizes it. | LOW (F1 / TE-C4-1) | [x] commit 90f1b2e2 |
| 4 | In `src/lib/auth/find-session-user.ts:33,37`, append `?? null` so `findSessionUser` returns `null` (not `undefined`) when no row matches, matching `findSessionUserWithPassword`. Update the doc comment to state the `null` not-found contract. | LOW (F2 / CR-C4-1 / DOC-C4-1) — NOT DEFERRABLE | [x] commit 4994e113 |
| 5 | Update the two existing tests that asserted `toBeUndefined()` (id path + username path) to assert `toBeNull()` — they encoded the old buggy behavior. | LOW (F2 / TE-C4-2) | [x] commit 4994e113 |
| 6 | (F5, opportunistic) Add a short comment at `ip.ts` `0.0.0.0`/null sentinel return site cross-referencing `isJudgeIpAllowed`. No behavior change. | LOW (F5 / CR-C4-3) | [x] commit 90f1b2e2 |
| 7 | Run all gates: `npm run lint`, `tsc --noEmit`, `npm run build`, `npm run test:unit`, `npm run lint:bash`. | — | [x] |
| 8 | Commit + push fine-grained per-topic, GPG-signed, conventional + gitmoji. | — | [x] |
| 9 | Run per-cycle `DEPLOY_CMD` (algo flags). | — | [x] (deploy-docker.sh exit 0; live HTTP 200 — see Progress) |

---

## Quality gates

- [x] `npm run lint` — 0 errors, 0 warnings (exit 0)
- [x] `tsc --noEmit` — PASS (exit 0)
- [x] `npm run build` — PASS (exit 0; compiled successfully, all pages)
- [x] `npm run test:unit` — PASS (319 files, 2450 tests; +5 from the 2445 baseline: 3 ip.test mapped cases + 2 ip-allowlist mapped cases; the 2 find-session-user cases were updated in place, not added)
- [x] `npm run lint:bash` — PASS (exit 0)

---

## Deferred ledger (cycle 4)

Per `plans/open/README.md` and the orchestrator deferred-fix rules, every still-open
finding is either implemented above or recorded here with severity preserved (NOT
downgraded) and a stated exit criterion. F1 and F2 are NOT deferred (correctness/
availability). No security/correctness/data-loss item is deferred without basis;
F3 is gated by an explicit trust boundary (authenticated judge workers are trusted
infrastructure) and is not a confirmed defect under that model.

| ID | Severity | Confidence | File | Reason for deferral | Exit criterion |
|---|---|---|---|---|---|
| F3 (SEC-C4-2 / SEC-C4-3 / TE-C4-3) | LOW | MEDIUM | `src/app/api/v1/judge/poll/route.ts:96-103,161-166`; `src/lib/judge/verdict.ts:39-68` | Worker result trust: `testCaseId` is FK-constrained to `test_cases` (blocks fabricated IDs) but not scoped to the claimed problem; `score = passed/results.length` lets a partial set inflate the score. BOTH are gated by claimToken ownership AND the authenticated-worker trust boundary — judge workers are trusted infrastructure (per-worker secrets, IP allowlist). Not a confirmed correctness/data-loss/security defect under the current trust model. critic explicitly cautions against over-engineering full-result validation now. | Re-open if/when untrusted or third-party judge workers become possible, OR if a worker bug is observed inflating scores in production. Then: validate reported `testCaseId`s ∈ the claimed problem's test-case set and compare `results.length` to the problem's test-case count before computing score. |
| F4 (CR-C4-2 / PERF-C4-1) | LOW | MEDIUM | `src/app/api/v1/judge/claim/route.ts:130,143-150,298-306` | Up to 3 SELECTs of the same `judge_workers` row per claim. Bounded by worker count; no correctness impact; the atomic claim CTE is the real gate. No measurable cost at current scale. | Re-open if the claim path appears in DB profiling, or fold into a refactor that returns the auth-helper's already-fetched worker row. |

### Carried-over from cycle-3 ledger (still open — NOT re-counted as cycle-4 new)
F3-cycle3 (bulk-recruiting email divergence — product decision), F4-cycle3
(`hashConfig` cleartext, in-memory only), F5-cycle3 (per-send config resolution),
F6-cycle3 (SMTP UX polish), F7-cycle3 (provider-name staleness), F8-cycle3
(advisory locks / deep-clone). All remain valid in
`plans/open/2026-05-29-cycle-3-rpf-review-remediation.md` with their exit criteria.

---

## Progress

- [x] Per-agent reviews written (`.context/reviews/cycle-4-2026-05-29/`)
- [x] Aggregate written (`.context/reviews/_aggregate.md` + `_aggregate-cycle-4.md`; prior preserved)
- [x] Plan written
- [x] F1 implemented (IPv4-mapped normalization) + tests — commit 90f1b2e2
- [x] F2 implemented (`findSessionUser` `?? null`) + test — commit 4994e113
- [x] Gates green (lint 0, tsc 0, build 0, 2450 unit tests, lint:bash 0)
- [x] Committed and pushed (fine-grained, GPG-signed): 90f1b2e2, 4994e113, 616c1ef1 → pushed to main
- [x] Deployed (per-cycle) — `deploy-docker.sh` exit 0, "Deployment complete!". Verified live: `https://algo.xylolabs.com/` and `/login` both HTTP 200. Post-deploy E2E smoke: 141 passed, 7 login-gated specs failed (admin-languages, admin-workers, auth-flow, contest-access-code-gate ×2, contest-nav-test, rankings) — ALL the same pre-existing cause cycles 1-3 documented: the smoke profile logs in with the sentinel password `skip-login`, so `loginWithCredentials` (helpers.ts:32) hits the forced-password-change guard and login cannot redirect to `/dashboard`. These specs are login-gated and unrelated to this cycle's diff (IPv4-mapped-IPv6 normalization in `ip.ts` / `findSessionUser` null sentinel — neither touches the login/redirect flow). `src/lib/auth/config.ts` was NOT modified this cycle (preserved per CLAUDE.md). The PG volume safety guard ran; no `docker system prune --volumes` was executed.
