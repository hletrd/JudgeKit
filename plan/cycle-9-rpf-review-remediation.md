# Cycle 9 RPF — Review Remediation Plan

**Date:** 2026-05-29
**HEAD at planning:** 24939e42 (main)
**Source review:** `.context/reviews/cycle-9-2026-05-29-rpf/_aggregate.md` (11 lenses)
**Baseline gates:** lint 0/0, tsc 0, test:unit 2472/321 PASS, lint:bash 0.

---

## Scheduled (implement this cycle)

**None.** This is a convergence cycle: the cycle-9 multi-lens review produced
**0 net-new actionable findings** (0 HIGH, 0 MEDIUM, 0 LOW-actionable).

The freshest code surface since the cycle-8 review baseline (the email
subsystem — HTML escaping, SMTP retry/timeout/STARTTLS, auto-send verification,
recruiting invite, SMTP settings UI) was reviewed in depth across 11 lenses and
found sound. The single high-signal candidate finding (email-subject CRLF /
header injection) was investigated and **verified to be a false positive** —
nodemailer 7.0.13 strips CR/LF from the Subject header
(`node_modules/nodemailer/lib/mime-node/index.js:1152`), and the three HTTP-API
providers send the subject as a JSON body field, not a raw header. No exploitable
vector exists. Per the orchestrator's convergence guidance, this is NOT raised as
an issue and NOT converted into speculative defense-in-depth scope.

The cycle-8 N8-C8-LIVERANK leaderboard fix (the prior cycle's scheduled work) was
re-verified correct against the full board.

---

## Deferred findings (recorded per repo deferred-fix rules; severity preserved)

All carried-forward items from `_aggregate-cycle-8-snapshot.md` were re-assessed
this cycle; preconditions unchanged → RE-DEFER with severity preserved. The full
ledger (file+line, severity, reason, exit criterion) is in
`.context/reviews/cycle-9-2026-05-29-rpf/_aggregate.md` under "Re-assessed carried
DEFERRED items." No security/correctness/data-loss finding is deferred (none
exists this cycle). Key items (severity NOT downgraded):

- **N7-C7 override overlay on the single-user live rank** — LOW/MED. Exit: product
  decision on ICPC override AC-time source, OR an explicit IOI-only override-aware
  live-rank cycle.
- **AGG-2** (rate-limit Date.now hot path + overflow sort) — MEDIUM. Exit:
  rate-limit-time perf cycle.
- **ARCH-CARRY-1** (raw API handlers) — MEDIUM. Exit: API-handler refactor cycle.
- **PERF-3** (anti-cheat dashboard) — MEDIUM. Exit: p99 > 800ms OR >50 concurrent
  contests.
- **D1/D2** (JWT clock-skew / per-request DB) — MEDIUM. Exit: auth-perf cycle; fix
  must live OUTSIDE `src/lib/auth/config.ts` per CLAUDE.md.
- **F3/F4/N3, DOC-C5-2** (worker trust/SELECT/index/dead field) — LOW. Exit:
  untrusted-worker support OR DB-profiling signal.
- **ARCH-CARRY-2** (SSE O(n) eviction) — LOW. Exit: SSE perf cycle OR >500 conns.
- **C1-AGG-3, C2-AGG-5, C2-AGG-6, C3-AGG-5, C3-AGG-6, AGG-7, AGG-9, C7-AGG-6,
  C7-DS-1, C7-DB-2-upper-bound, DEFER-ENV-GATES** — LOW. Exit criteria unchanged
  from the cycle-8 ledger.

---

## Plan-archive action this cycle
- `plan/cycle-8-rpf-review-remediation.md` is fully implemented (Task A DONE, all
  progress-log items `[x]`, deployed per-cycle-success in cycle-8). Archive it
  (`.archived` suffix) to keep only actionable plans live, consistent with the
  repo's archival convention.

---

## Progress log
- [x] PROMPT 1: 11-lens review + aggregate written to
      `.context/reviews/cycle-9-2026-05-29-rpf/` and promoted to top-level
      `.context/reviews/_aggregate.md`. Cycle-8 aggregate snapshotted.
- [x] PROMPT 2: convergence recorded; all carried findings re-deferred with
      severity preserved; cycle-8 plan archived.
- [x] PROMPT 3: no implementation needed (0 findings). Gates re-verified green
      (lint 0/0, tsc 0, build OK, test:unit 2472/321, lint:bash 0). No code
      change → no commit churn manufactured. Deploy per DEPLOY_MODE=per-cycle.
