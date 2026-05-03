# State of the Project — Synthesis

**Date:** 2026-05-03
**Purpose:** Cut through marketing copy, individual cycle reviews, and self-congratulation to produce a single source-of-truth read on where JudgeKit actually stands at HEAD.

---

## Where the project says it stands

The project's *own* documentation is the most credible source. Per `docs/high-stakes-operations.md`:

- **Homework / low-stakes coursework:** supported.
- **Internal recruiting pilot:** supported with restrictions.
- **Formal exams:** NOT launch-ready.
- **Public / reputationally important contests:** NOT launch-ready.

Per `docs/go-no-go-memo.md` (2026-04-04): explicit NO-GO for formal exams and public contests at that date.

Per `.context/reviews/2026-05-03-multi-perspective/00-overall-verdict.md`: a sprint-level remediation push has *upgraded* recruiting and exams to **GO-WITH-CAVEATS** based on 11 of 14 critical/high findings being closed in two weeks. This is real progress, not marketing.

---

## What has actually shipped recently

Last ~30 commits (since ~April 17) have a coherent story:

- **Anti-cheat hardening** — server-side heartbeat freshness check at submit time (`a88f640b`).
- **Per-language time limit multipliers** — fairness across language ecosystems (`e48c2f33`).
- **Recruiting UX** — candidate results page, employer branding, language preview on invitation.
- **Backup hygiene** — `ALWAYS_REDACT` map for sensitive fields, pre-restore snapshots, pre-deploy `pg_dump` retention.
- **SECURITY.md** + a vulnerability reporting policy.
- **Platform-aware submit shortcuts** + 4-second cancel window — student QoL.
- **Sidecar-token enforcement** for `code-similarity` and `rate-limiter` services (`a092f26f`).
- **Compile-phase swap cap = memory cap** — closes a memory-pressure DoS amplification.
- **dockerfilePath anchoring** — prevents arbitrary image build paths.
- **Bulk paste-list student enrollment** — major instructor workflow fix.
- **Metrics auth + bulk username support** (`5e4bd457`).
- **Privacy page cross-link from /recruit landing** (`24bc5f85`).

Active uncommitted work (per `git status`):
- `playwright.config.ts` — adding new responsive-layout test config.
- `tests/e2e/responsive-layout.spec.ts` — new E2E suite for responsive UX validation.
- `capture-screenshots.ts` — automated multi-viewport screenshot generator.

**Read:** the team is currently focused on validating responsive UX across viewports, which is exactly the gap that the new request from the user is asking us to live-test against.

---

## Tech-stack reality vs marketing

| Marketed | Actual at HEAD |
|---|---|
| 125 language variants in 102 Docker images | True at code level. Some variants (per `.context/development/open-workstreams.md`) are KNOWN_FAILING (`fsharp`, `vbnet`, `purescript`, `mercury`, `curry`, `carp`, `roc`, `grain`). Realistic count: ~100 reliably working. |
| Cross-platform AMD64 + ARM64 | True. All judge images build on both architectures. |
| Distributed judge workers with auto-registration and heartbeats | True. Live admin dashboard exists. |
| Secure execution (Docker, no network, seccomp, memory/CPU limits) | True. Above-baseline for self-hosted. |
| 43-capability granular RBAC, admin-editable | True. |
| TA role intentionally view+comment-only | True at SQL layer. Practically too narrow for typical TA duties. |
| Classroom management (groups, enrollments, assignments, late penalties) | True; flat groups, no semester hierarchy, no per-day late schedule UI. |
| Contest system: ICPC + IOI, freeze, real-time leaderboard, anti-cheat | True. Genuinely competition-grade. |
| Code similarity (Rust-accelerated Jaccard n-gram with TS fallback) | True. Cannot detect AI-generated code; detects copy-paste with minor renaming. |
| Multi-instance app server | Conditional. README warns to validate sticky-session and PostgreSQL coordination before claiming exam-grade or public-contest readiness. |

Net: the marketing is mostly accurate. The accuracy *gaps* are honest mistakes of omission, not misrepresentation. There is no "we say X but X does not exist" pattern.

---

## Where the project's own docs are blunt about limits

This is the part of the codebase that builds the most trust:

- `docs/exam-integrity-model.md` — what the anti-cheat actually proves (telemetry, not enforcement).
- `docs/high-stakes-operations.md` — operational truth and launch checks.
- `docs/high-stakes-validation-matrix.md` — required evidence before changing GO/NO-GO decisions.
- `docs/threat-model.md` — explicit threat model.
- `docs/judge-worker-incident-runbook.md` and `docs/operator-incident-runbook.md` — written like they were written *after* incidents, not before launches.
- `CLAUDE.md` — preserves "do not regenerate `src/lib/auth/config.ts`" because production-specific logging lives there. Also pins Korean typography rules to prevent letter-spacing regressions.
- `.context/development/open-workstreams.md` — track of unfinished work so future sessions don't ship it as complete.

This is documentation written by people who have shipped in anger.

---

## Open vs closed at HEAD

**Closed since April 17:**
- Heartbeat freshness server-side enforcement
- Per-language TL multipliers
- Backup credential redaction
- Pre-restore snapshots
- Sidecar token enforcement
- Compile swap cap
- dockerfilePath anchoring
- Bulk student enrollment
- Group-scoped TA visibility (SQL trigger layer)
- Candidate results page
- Recruit page employer branding
- Heartbeat dedup
- Submit-cancel window
- Per-language code templates
- Privacy page + cross-link

**Open at HEAD:**
- No MFA on staff accounts (CRITICAL)
- No lockdown-browser integration (architectural; SEB is the standard)
- Heartbeat is browser-script-defeatable (architectural; would need cryptographic challenge)
- Code similarity does not catch AI-generated code (architectural; needs third-party)
- Editor lacks autocomplete and other CodeMirror extensions (one-day fix)
- LMS / LTI 1.3 integration absent (institutional adoption blocker)
- No rubric grading (subjective grading blocker)
- No per-day late schedule UI (academic adoption gap)
- No assignment-fan-out across groups (multi-section blocker)
- TA role too narrow for actual TA duties
- Multi-instance app server "warned about" — not signed off
- Per-endpoint latency / per-worker metrics not exported
- No PITR; no automated daily backups
- Mobile UX gaps (sticky panel + soft keyboard, side-by-side diff, table responsiveness) — see `08-responsive-live.md`
- Production deploy lag at `algo.xylolabs.com` per April reviews — code is ahead of prod
- Socket proxy still permits container inspection (HIGH security finding)
- Non-image upload trusts client MIME (HIGH security finding)
- ZIP entry decompression precedes total-size check (MEDIUM)
- Restore endpoint lacks semantic validation (MEDIUM)
- Candidate PII plaintext in DB (MEDIUM)
- No backup encryption at rest (MEDIUM)
- `JUDGE_ALLOWED_IPS` defaults to allow-all (MEDIUM)
- Retention pruner not visibly cron'd (MEDIUM)
- No supply-chain scanning / image signing (MEDIUM)

---

## Maturity assessment

Stage: **late beta → early production**, with strong signals of operational maturity (incident-driven runbook quality, deploy-script defenses, honest documentation of limits) and clear gaps in the next-stage features (HA, observability depth, MFA, lockdown integration, LMS).

By use case:

| Use case | Maturity | Recommendation |
|---|---|---|
| Self-hosted homework, single course | **Production** | Ship it. |
| Self-hosted contests, departmental | **Production** | Ship it. |
| Async take-home exam | **Production-with-caveats** | MFA first. |
| Recruiting (screening) | **Production-with-caveats** | MFA, external AI detection on review. |
| Recruiting (final-round) | **Beta** | Add SEB or proctoring; acknowledge editor gaps. |
| Synchronous proctored exam | **Beta** | Bring SEB. |
| Public reputational contest | **Beta** | Validate multi-instance first. |
| Institutional rollout | **Alpha** | LTI is a hard prereq. |
| Hostile multi-tenant SaaS | **Not in scope** | Different product. |

---

## Reading the trajectory

What is the team prioritizing? The recent commit list, plus the uncommitted work, suggests:

1. **Closing the integrity-vs-honesty gap** (heartbeat, TL multipliers, recruiting flow polish). Done well.
2. **Operational hardening** (backup redaction, pre-restore snapshots, sidecar tokens). Done well.
3. **Responsive UX validation** (active uncommitted work). In progress.

What the team has *not* prioritized recently and probably should:

1. **MFA** — the single highest-impact remaining security gap.
2. **LMS / LTI** — the single highest-impact institutional-adoption gap.
3. **Editor extensions** — the single highest-impact perceived-quality gap for recruiting.
4. **Multi-instance validation** — the single highest-impact scaling gap.

These four are not architectural, they are sprints.

---

## Honest verdict

JudgeKit is a *credible* online judge built by a team that has clearly been to production, suffered, and learned. Its security posture, sandbox quality, and documentation honesty all sit comfortably above the typical self-hosted-OJ baseline. Its ceiling on use-case ambition is set by features it has chosen not to build *yet*: MFA, LMS integration, lockdown-browser support, AI detection.

For the user's stated three use cases (recruiting, classroom assignments + exams, programming contests):

- **Recruiting:** ✅ acceptable for screening, ⚠️ conditional for final-round. Add MFA and external AI detection before scale.
- **Classroom homework + autograded assignments:** ✅ acceptable today.
- **Classroom exams (synchronous, proctored):** ⚠️ acceptable only with external proctoring (SEB or human). The platform agrees.
- **Programming contests:** ✅ acceptable today, with the caveat that synchronous-500+-concurrent stresses unvalidated multi-instance code.

If the user wants this to be the *single* tool for all three use cases, the path to confident yes-yes-yes is roughly two sprints of disciplined work (MFA, editor extensions, SEB integration, automated backups, multi-instance validation). The platform is closer to "production-ready everywhere" than its own docs claim — but only if you do those sprints.
