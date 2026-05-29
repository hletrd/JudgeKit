# RPF Cycle 9 — Aggregate Review

**Date:** 2026-05-29
**HEAD reviewed:** 24939e42 (main)
**Cycle:** 9/100 (orchestrator-numbered)
**Per-agent reviews:** `.context/reviews/cycle-9-2026-05-29-rpf/{security-reviewer,verifier,code-reviewer,perf-reviewer,test-engineer,debugger,tracer,architect,critic,document-specialist,designer}.md` (11 lenses)
**Prior aggregate preserved:** `_aggregate-cycle-8-snapshot.md`, `_aggregate-cycle-7-snapshot.md`.
**Baseline gates (re-run this cycle, whole repo):** `npm run lint` 0 errors/0 warnings; `npx tsc --noEmit` 0; `npm run test:unit` **2472 tests / 321 files PASS**; `npm run lint:bash` 0. (Build re-verified in PROMPT 3.)

---

## Scope
The net-new change surface since the cycle-8 review baseline (db1a28d0) is the
**email subsystem** — commits 6e1ea706 (HTML escape + SMTP retry/timeout/STARTTLS),
efbd9e2e (auto-send verification on signup + recruiting invitation email),
871e3583 (SMTP settings UI) — plus the already-reviewed cycle-8 leaderboard fix
(f0d79935). This cycle drilled into the freshest code (email send path, templates,
all four providers, signup-triggered dispatch, verify-email flow) and
re-verified the cycle-8 N8-C8-LIVERANK fix against the full board.

---

## NEW deduplicated findings this cycle

**Severity tally (NEW): 0 HIGH, 0 MEDIUM, 0 LOW-actionable.**

No net-new actionable finding. This is a genuine convergence cycle.

### Investigated hypothesis — REJECTED after evidence-based verification (high signal across 4 lenses)
**Email-subject CRLF / header injection.** `renderRecruitingInvitationEmail`
(`templates.ts:59`) and `renderSiteEventEmail` (`templates.ts:75`) interpolate
attacker-/operator-influenced data into the email **subject** without the
`escapeHtml()` applied to the HTML body; the recruiting title is instructor-
controlled (`recruiting-invitations/route.ts:134`). A naive review would flag this
as SMTP header injection.

**Verified false positive** (security-reviewer + tracer + verifier + critic concur):
- **SMTP** (nodemailer 7.0.13): `Subject` hits the `default` branch of
  `_encodeHeaderValue` (`node_modules/nodemailer/lib/mime-node/index.js:1152`):
  `value.replace(/\r?\n|\r/g, ' ')` — **all CR/LF stripped before the header is
  built.** No injection.
- **Resend / SendGrid / SES**: subject is sent as a JSON body field
  (`resend.ts:29`, `sendgrid.ts:29`, `ses.ts:31`), never as a raw header. JSON
  encoding neutralizes structural injection; the provider builds headers
  server-side.

There is therefore no exploitable vector. The earlier-cycle HTML-escape fix
(6e1ea706) already closed the only real (body-XSS) path. Per the orchestrator's
explicit convergence guidance ("do NOT manufacture low-value churn or invent new
scope just to keep finding things"), this is recorded as a verified non-finding,
NOT raised as an issue and NOT turned into speculative defense-in-depth scope.

### Confirmed-sound (no finding)
- **cycle-8 N8-C8-LIVERANK fix**: live-rank IOI query (`leaderboard.ts:218-248`)
  now uses a per-problem-best `MAX` CTE then per-user `SUM`, matching the full
  board (`contest-scoring.ts:233-243` + JS sum). Symmetric; docstring accurate;
  structural guard tests green. Verified by reading both query bodies.
- **verifyEmail** TOCTOU-safe (in-tx read + conditional update + rowCount guard);
  token stored as SHA-256 hash only.
- **sendEmailVerification** atomic delete+insert token.
- **public-signup auto-send** fire-and-forget with `.catch()` (no unhandled
  rejection); canonical-first base URL (no client-Host trust).
- **SMTP plaintext-fallback decrypt** prevents a legacy plaintext secret from
  silently disabling all email; **SMTP_SKIP_TLS_VERIFY** strict `!== "true"`.
- **overrides route** authz→validate→tx-upsert→invalidate→audit.
- **SMTP settings form** accessible (Label htmlFor↔id on every input, password
  masked + only resubmitted when changed, labeled checkbox, all-i18n labels →
  no Korean letter-spacing violation).

---

## Re-assessed carried DEFERRED items (severity preserved, NOT downgraded)

All carried-forward items from the cycle-8 aggregate re-assessed; preconditions
unchanged → RE-DEFER with severity preserved. No security/correctness/data-loss
finding is deferred (none exists this cycle).

| ID | Severity | Re-assessment this cycle | Status |
|---|---|---|---|
| N7-C7 override overlay on live rank | LOW/MED | Product decision on ICPC override AC-time source still pending. | RE-DEFER |
| F3 / F4 / N3 (worker trust, triple SELECT, failedTestCaseIndex) | LOW | Trust model unchanged; no DB-profiling signal. | RE-DEFER |
| DOC-C5-2 (register staleClaimTimeoutMs dead field) | LOW | Rust worker only deserializes. | RE-DEFER |
| AGG-2 (rate-limit Date.now hot path + overflow sort) | MEDIUM | No perf signal. | RE-DEFER |
| ARCH-CARRY-1 (raw API handlers) | MEDIUM | Preconditions unchanged. | RE-DEFER |
| ARCH-CARRY-2 (SSE O(n) eviction) | LOW | >500 conns threshold unmet. | RE-DEFER |
| PERF-3 (anti-cheat dashboard) | MEDIUM | No p99 signal. | RE-DEFER |
| D1 / D2 (JWT clock-skew / per-request DB) | MEDIUM | Fix must live OUTSIDE `src/lib/auth/config.ts` per CLAUDE.md. | RE-DEFER |
| C1-AGG-3 (client console.error count) | LOW | Observability cycle. | RE-DEFER |
| C2-AGG-5 (visibility-aware polling hook) | LOW | 7th-instance trigger unmet. | RE-DEFER |
| C2-AGG-6 (practice filter) | LOW | No scale signal. | RE-DEFER |
| C3-AGG-5 / C3-AGG-6 (deploy-docker.sh size / peer-user) | LOW | Thresholds unmet. | RE-DEFER |
| AGG-7 (encryption plaintext fallback) | LOW | Documented; no incident. | RE-DEFER |
| AGG-9 / rate-limit 3-module duplication | LOW | No consolidation cycle. | RE-DEFER |
| C7-AGG-6 (participant-status time-boundary tests) | LOW | No boundary bug report. | RE-DEFER |
| C7-DS-1 (README /api/v1/time doc) | LOW | README rewrite cycle. | RE-DEFER |
| C7-DB-2-upper-bound (DEPLOY_SSH_RETRY_MAX cap) | LOW | No footgun report. | RE-DEFER |
| DEFER-ENV-GATES (DB-backed integration tests) | LOW | No provisioned CI/host. | RE-DEFER |

---

## Cross-agent agreement summary
- The single high-signal candidate (email-subject injection) was investigated by
  4 lenses (security, tracer, verifier, critic) and unanimously confirmed a
  **false positive** by reading the transport library + provider source. Correct
  call: do not raise.
- All lenses agree the cycle-8 leaderboard fix is correct and the carried
  deferred items' preconditions are unchanged.
- No Korean-typography or `src/lib/auth/config.ts` implications.

## Convergence status
**CONVERGED this cycle: NEW_FINDINGS = 0.** After a genuinely thorough multi-angle
pass over the freshest code surface (email subsystem, 11 lenses) and
re-verification of the cycle-8 fix, there is no net-new actionable defect and no
open actionable plan item (the cycle-8 plan is fully implemented + deployed; the
remaining backlog is carried LOW/MEDIUM deferred items with unchanged
preconditions). Per the orchestrator's convergence guidance, reporting
NEW_FINDINGS: 0 and COMMITS: 0 honestly so the loop can converge.

## AGENT FAILURES
None. This environment registers no project-specific `*-reviewer` subagents and
the running general-purpose agent cannot recursively spawn subagents; the 11
specialist lenses were executed in-process and written to per-agent files for
provenance (consistent with all prior RPF cycles in this repo). All 11 lenses +
aggregate completed.
