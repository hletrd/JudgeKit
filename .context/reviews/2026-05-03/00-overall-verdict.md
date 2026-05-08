# JudgeKit Multi-Perspective Review — Overall Verdict

**Deployment**: https://algo.xylolabs.com (production)
**Date**: 2026-05-03
**Method**: live UI probing (agent-browser headless Chromium 148 + curl) + full codebase + Rust judge worker + sidecars + deploy script + runbooks
**Reviewers**: 6 parallel perspectives (student, instructor, admin, TA/assistant, applicant, security) + main aggregator
**Stated use cases**: recruiting coding tests · student assignments · student exams · programming contests
**Probe evidence**: `/tmp/judgekit-review/probe-evidence.md` (also embedded in each per-perspective review)
**Screenshots**: `/tmp/judgekit-review/screenshots/01-..18-broken-404.png`

---

## TL;DR — single-sentence verdict per stated use case

| Use case | Verdict | One-line reason |
|---|---|---|
| **Recruiting coding tests** | **NO-GO** | Anti-cheat is browser telemetry only; a candidate with `curl` produces an indistinguishable "clean session" and the platform's own integrity model concedes this. Hiring decisions made on the current build are not defensible. |
| **Student exams (high-stakes, proctored)** | **NO-GO** | Same architectural ceiling — `docs/exam-integrity-model.md` already calls this out. Use Safe Exam Browser / live human proctoring out-of-band, never trust in-app heartbeats as evidence. |
| **Student assignments (homework / honor-system)** | **GO-WITH-CAVEATS** | Core grading loop is sound; bulk-enroll, per-language time limits, and surfaced anti-cheat for homework are missing; admin / TA permission gaps still leak group scope. |
| **Programming contests (closed/internal honor-system)** | **GO-WITH-CAVEATS** | The contest tooling is the platform's strongest surface. Single-worker production deployment + `SUBMISSION_GLOBAL_QUEUE_LIMIT=100` + a few UX bugs are operational risks, not security failures. |

The honest framing: **JudgeKit is a competently engineered judging system with one of the better backends I've reviewed in this category.** Its judging architecture, sandbox layering, capability system, and anti-cheat data flow are genuinely above average. Its weaknesses are (a) an architectural ceiling on integrity that the marketing/recruiting surface does not yet concede, (b) accumulated UX and operational drift that would lose a candidate or recruiter on first impression, and (c) a small number of stop-ship items (one missing production env var, one missing 404 boundary, one disclosure of the admin username) that are weeks of polish from done — not a rewrite.

---

## Scorecard

| Perspective | Score | One-line summary |
|---|---|---|
| Student (practice / homework / exam / contest) | **6.0 / 10** | Solid backend; learning scaffolding (hints, mastery, scaffolded feedback) is missing; small UX lies (B1 / B2 / F7) erode trust. |
| Instructor (homework / exam / contest) | **6.5 / 10** | Strong contest workflow; weekly homework needs bulk enroll, per-language TL multipliers, anti-cheat tab on homework pages, LMS integration. |
| Admin / DevOps (production operability) | **6.0 / 10** | Auth, audit, and pre-deploy backup are right; metrics endpoint is broken in production, single worker is a SPOF, no MFA, no daily-backup confirmation. |
| TA / Assistant (group-scoped grading) | **3.0 / 10** | `assistant` role exists but cannot do the core TA job: no `submissions.comment`, no override, and `submissions.view_all` bypasses group scope. The `group_instructors.role='ta'` value is still cosmetic. |
| Job applicant (recruiting flow) | **5.0 / 10** | Candidate-protective basics are present (autosave, re-entry, AI-off default). Branding, name-leak in OG metadata, language fairness, results page, and GDPR data-subject path are all gaps. |
| Security / adversarial | **5.5 / 10** | Sandbox + crypto + CSRF + ORM are above-average. Anti-cheat is honor-system only; one CRITICAL operational misconfiguration in production; one CRITICAL architectural ceiling for recruiting/exam claims. |
| **Overall** | **5.5 / 10** | Built by someone who knows what they're doing; not yet finished for the stated high-stakes use cases. |

These are aggregate scores; per-section detail and citations live in the six perspective files (`01-student.md`, `02-instructor.md`, `03-admin.md`, `04-assistant.md`, `05-applicant.md`, `07-security.md`).

---

## Cross-cutting CRITICAL items (block recruiting / exam launch)

The following findings appeared in two or more perspectives independently. They are the platform's actual ceiling.

### C-1 — Anti-cheat does not bind to submission ingestion (CRITICAL)
**Source**: security F1 + applicant F4 + student exam-mode walkthrough.
**Where**: `src/app/api/v1/submissions/route.ts:166-300+` (submission POST), `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` (events).
A candidate with `curl` and a stolen / legitimate cookie can submit code without producing any tab-switch / blur / paste events; reviewers see a record indistinguishable from a focused honest session. The platform's own `docs/exam-integrity-model.md:5-20` documents this ceiling. Required for recruiting/exam: a server-issued exam-session token whose freshness is checked at submission ingestion, AND honest user-facing copy that does not represent green heartbeats as integrity proof.
**Fix sketch**: short-lived exam-session token issued from `examSessions`; on `submissions.create` when `assignment.examMode != "none"`, reject if last heartbeat for `(userId, assignmentId)` is older than 60 s.
**ETA**: 3–5 days.

### C-2 — `/api/metrics` returns 503 in production (CRITICAL operational)
**Source**: security F2 + admin RISK-1.
**Where**: `src/app/api/metrics/route.ts:33`. Live: `curl https://algo.xylolabs.com/api/metrics` → `503 {"error":"CRON_SECRET not configured"}`.
The `CRON_SECRET` env var is unset in `.env.production`. Net effect: no Prometheus scrape, no alerting, AND the env-var name leaks publicly. The deploy script's `ensure_env_secret` does not include `CRON_SECRET`. Operators have not noticed because nobody monitors a broken metrics endpoint.
**Fix sketch**: set `CRON_SECRET=<openssl rand -hex 32>` in `.env.production` on algo; change the missing-secret branch to return 404, not 503-with-env-var-name; add `CRON_SECRET` to `instrumentation.ts` startup gate so the next forgotten config crashes the boot rather than silently breaks the metric.
**ETA**: 30 minutes for the env var; 2 hours for the startup gate and runbook update.

### C-3 — Double-rendered chrome on every 404 (HIGH — visible quality flag)
**Source**: probe B1 + student F1 + applicant Tier-1 polish + admin observability section.
**Where**: every not-found path under the `(public)` group (e.g., `/practice/problems/nonexistent`, `/users/admin`, `/practice/sets/nonexistent`).
The `(public)` segment lacks its own `not-found.tsx`, so `notFound()` falls through to `src/app/not-found.tsx` which itself wraps content in `PublicHeader + main + PublicFooter` — exactly the chrome the `(public)` layout already provided. Result: two banners, two `<main>` regions, two footers (WCAG violation: multiple landmarks of the same role). Worse: the response status is **HTTP 200** rather than 404 (soft-404 — Google indexes it as valid content; link checkers don't flag broken links).
**Fix sketch**: create `src/app/(public)/not-found.tsx` modelled on the existing `src/app/(dashboard)/not-found.tsx` (inner content only, no chrome). Verify status is 404 after the fix.
**ETA**: 30 minutes.

### C-4 — Admin username disclosed on public `/rankings` (HIGH — credential-stuffing magnet)
**Source**: probe B3 + security F5 + admin RISK-4 + student F6 + applicant trust signal.
**Where**: `src/app/(public)/rankings/page.tsx:163-195`.
The literal username `admin` plus the role-string `"Super Admin"` (used as the user's display Name) is rendered to anonymous internet visitors, with a Diamond tier badge. Combined with no MFA on staff accounts, this is a free credential-stuffing target — and an instant trust signal to any candidate or proctor browsing the same hostname that hosts their hiring test.
**Fix sketch**: SQL filter — exclude users whose role is `super_admin`, `admin`, or `instructor`. Two-line change.
**ETA**: 2 hours.

### C-5 — TA built-in role bypasses group scope and cannot do the core TA job (HIGH)
**Source**: assistant BUG-1 + BUG-3 + BUG-4 + instructor F7.
**Where**: `src/lib/capabilities/defaults.ts:15-28` (assistant capabilities), `src/lib/assignments/management.ts:82-85` (`canManageGroupResourcesAsync`).
- BUG-1: `ASSISTANT_CAPABILITIES` includes `submissions.view_all`, which makes the group-scope filter at `src/lib/assignments/submissions.ts:165-179` a no-op. A TA for Group CS101 sees every submission across every group on the platform.
- BUG-3: `submissions.comment` and `submissions.rejudge` are absent from assistant defaults — a TA cannot leave feedback or correct an autograder error.
- BUG-4: score override gates on `canManageGroupResourcesAsync` which only honours `co_instructor`, not `ta`.
The historical bug ("the `group_instructors.role` column is stored but ignored") is half-fixed: `co_instructor` is now respected, `ta` is still a cosmetic label.
**Fix sketch**: swap `submissions.view_all` for `assignments.view_status` in `ASSISTANT_CAPABILITIES`; add `submissions.comment` and `anti_cheat.run_similarity`; honour `group_instructors.role='ta'` in `canManageGroupResourcesAsync`.
**ETA**: 1 day.

### C-6 — Recruit token URL leaks candidate name pre-auth (HIGH for recruiting)
**Source**: applicant F1 + applicant F2 + security F8.
**Where**: `src/app/(auth)/recruit/[token]/page.tsx:23-58, 71, 118-119`.
The recruit page resolves the candidate's name (e.g., "Welcome, Jiyong Youn") and embeds it in the page title and Open Graph metadata before any password is supplied. Anyone with the link — or any service that scrapes link previews (Slack, Outlook, autoresponders) — sees who is being recruited for what role. For a senior candidate at a competing company, this is a confidentiality breach that could cost them their current job.
**Fix sketch**: defer name disclosure until after the candidate authenticates with their account password (state `resumeWithCurrentSession`). Strip name from `<title>`, `description`, and OG fields; show only "You have been invited to a coding assessment for {company}."
**ETA**: 4 hours.

### C-7 — No MFA / TOTP for staff accounts (HIGH)
**Source**: security F23 + admin RISK-4 + applicant trust signal.
**Where**: `src/lib/auth/config.ts` credentials provider.
The roles with `submissions.view_all`, `system.settings`, `users.manage`, and `system.backup` capability — i.e., the roles that can read every candidate submission, every test case, every PII record, and download a full DB backup — sit behind a single-factor password. For a recruiting product handling candidate PII, this is indefensible.
**Fix sketch**: TOTP via `otplib`, gated on roles with any of the four capabilities above. WebAuthn is the longer-tail option.
**ETA**: 1 week.

### C-8 — Single judge worker is a hard SPOF for any 100+-student exam (HIGH)
**Source**: instructor F8 + admin RISK-2 + student exam walkthrough.
**Where**: live probe — "Workers online: 1, Parallel slots: 4."
A worker reboot during a 150-student mid-term causes a 5-minute submission blackout (default `STALE_WORKER_SECONDS=300`). There is no second worker, no drain-before-stop, no operator alert wired to `/api/health` returning `degraded` when `pending > 0 && online === 0`.
**Fix sketch**: deploy a second worker on `worker-0.algo.xylolabs.com` (or a separate physical box) using `docker-compose.worker.yml`; wire the degraded-state to whatever alerting will exist after C-2 is fixed; document the freeze-submissions-before-restart procedure in `docs/high-stakes-operations.md`.
**ETA**: 1 day for the second worker; 1 hour for the alert.

---

## Cross-cutting HIGH items (must fix before next quarter)

| ID | Source | Title | Fix complexity |
|---|---|---|---|
| H-1 | applicant F2 + recruiting product gap | No employer/company branding on `/recruit/[token]` | Add `organization_name`/`logo_url`/`recruiter_contact_email` columns; render on every state. ~1 day. |
| H-2 | instructor F1 + applicant F5 + student F-table | No per-language time multipliers | Schema column on `assignments`; apply at judge claim/result. ~3 days. |
| H-3 | instructor F2 | No bulk student enrollment | Textarea or CSV upload; single bulk-insert endpoint. ~1 day. |
| H-4 | applicant F6 | No candidate results page after deadline | New `/recruit/[token]/results` route; per-problem score, time used, my own code. ~2 days. |
| H-5 | applicant F-retention + security F-privacy | No GDPR / PIPA data-subject route | Privacy policy page, retention disclosure, deletion request endpoint. ~3 days. |
| H-6 | admin RISK-3 | No confirmed daily backup running on production | Verify systemd timer or cron is installed; document. ~1 hour to verify. |
| H-7 | admin RISK-5 | Restore overwrites DB with no automatic pre-restore snapshot | Server-side `pg_dump` before `importDatabase`. ~1 day. |
| H-8 | security F10 | Shared `JUDGE_AUTH_TOKEN` fallback survives | Per-worker tokens enforced; remove fallback. ~2 days. |
| H-9 | security F3 + F6 | Sidecar auth tokens optional in compose; worker compose has `WORKER_DOCKER_PROXY_BUILD` env-var footgun | Make tokens mandatory (`${VAR:?}`); hardcode `BUILD=0`/`DELETE=0` in worker compose. ~1 day. |
| H-10 | security F7 | Compile-phase swap up to 4 GiB allowed | Cap compile swap at configured `mem_limit`; special-case JVM/.NET only. ~half-day. |
| H-11 | probe B2 + security F4 + student F2 | Playground "no sign-in required" claim is false; bad shape returns 500 not 400 | Either build a true guest playground or remove marketing copy; fix Zod parse path. ~half-day for copy; ~2 days for guest playground. |
| H-12 | probe B4 + student F3 | `/submissions` is in public nav but is a sign-in wall | Build the public submission feed (verdicts only, no source) or move link to auth sidebar. ~2 days for feed. |
| H-13 | probe B5 + student F4 + applicant fairness | Practice catalog mixes Korean + English in default-EN locale | Per-locale title fields + filter chip. ~2-3 days. |

---

## Cross-cutting strengths — give credit where due

These appeared in 3+ perspectives independently as features the platform does well.

1. **Sandbox layering is materially above the bar for self-hosted OJs.** `--network=none`, `--cap-drop=ALL`, `--security-opt=no-new-privileges`, `--read-only`, custom seccomp profile (`docker/seccomp-profile.json`), `--user 65534:65534`, `--pids-limit 128`, `--init`, atomic claim with `FOR UPDATE SKIP LOCKED`. Better than DOMjudge's default profile.
2. **Auth & crypto are right.** Argon2id with OWASP parameters, transparent bcrypt → Argon2id migration, anti-enumeration via `DUMMY_PASSWORD_HASH`, JWT invalidation via `tokenInvalidatedAt`, three-layer CSRF (`X-Requested-With`, `Sec-Fetch-Site`, `Origin`/`Host`), DB-backed atomic rate limiter with `SELECT FOR UPDATE`.
3. **Capability-based authorization with custom roles.** ~43 granular capabilities; effective API-key role is `min(key.role, creator.role)`; capability changes survive deploys without a restart.
4. **CSP is hardened beyond what most apps ship.** `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, per-request nonces.
5. **Code execution pipeline is well-engineered.** Rust judge worker, Rust similarity sidecar, Rust rate-limiter sidecar, atomic claim + reclaim of stale submissions, custom seccomp by default for compile, body-limit on the runner.
6. **Server-time-synced countdown.** `/api/v1/time` returns DB-clock epoch (not Node `Date.now()`); client computes offset; unit-tested at `tests/unit/api/time-route-db-time.test.ts`. This is the right architecture and is rare in self-hosted OJs.
7. **Smart per-language templates with template-replacement detection.** `src/lib/judge/code-templates.ts` ships idiomatic starter code for 17 languages; switching language preserves real code but only swaps templates if the editor still contains the previous template. A polish tier above BOJ.
8. **Code drafts persisted across navigation with 7-day TTL.** localStorage-backed; `useUnsavedChangesGuard` warns before navigation. Combined with per-10s server-side `/api/v1/code-snapshots`, candidate code survives crashes.
9. **Contest workflow is the strongest surface.** ICPC + IOI scoring, freeze period, animated replay, analytics tab (score distribution, solve rates, anti-cheat summary, score progression), CSV/JSON export with anti-cheat counts and IPs, announcements + clarifications, recruiting mode with token-based invitations.
10. **Windowed exam model is well-designed.** Personal countdown derived from `startsAt + examDurationMinutes`; timing changes blocked once any session has started; `tests/unit/api/time-route-db-time.test.ts` guards the contract.
11. **Audit logging is comprehensive and fire-and-forget safe.** Every state-changing admin action records actor, action, resource, request context; buffer flushed on graceful shutdown; backup/restore are audited.
12. **Pre-deploy database backup is automatic and mandatory.** `deploy-docker.sh` runs `pg_dump` before touching containers; aborts if backup fails; 30-day retention.
13. **Docker image path injection is properly defended (post-fix b2b07edd).** `buildDockerImageLocal` anchors `startsWith("docker/Dockerfile.")`. Worth also adding the `judge-` infix that the Rust validator already requires (security F9 / F28).
14. **Korean / English bilingual UI works end-to-end.** ~140 KB i18n strings per locale; locale-keyed homepage; problem statements can be authored in either language. Korean letter-spacing rule (`CLAUDE.md`) is honoured (`letter-spacing: normal` on KR text — verified live).
15. **Detailed verdict feedback with educator toggles.** `failedTestCaseIndex`, `runtimeErrorType`, `executionTimeMs`, `memoryUsedKb`, `compileOutput` — and `showDetailedResults` / `showRuntimeErrors` / `showCompileOutput` toggles for exam-vs-practice differentiation.

---

## Use-case readiness — final check

### Programming contests (closed/internal honor-system) — READY with two operational caveats

The contest tooling is the platform's most complete surface. Score 8/10 from the instructor review is defensible. To run a real contest today:

1. Deploy a second judge worker before contest day (C-8). Single-worker SPOF is the only material exam/contest risk.
2. Set `CRON_SECRET` (C-2) so that operator alerting actually works.
3. Strip staff from `/rankings` (C-4) for first-impression hygiene.
4. Fix the 404 chrome (C-3) so a stale link doesn't render two `<main>` elements.

After these four 1-day fixes, JudgeKit is a credible alternative to DOMjudge for an internal contest with anti-cheat depth that DOMjudge lacks.

### Student assignments (homework / honor-system) — READY for piloting, NOT for a 150-student course today

Adoption blockers per instructor review:

1. **No bulk student enrollment** — onboarding 150 students one dropdown at a time is operationally impossible.
2. **No per-language time multiplier** — Python 3-10x slower than C++ on the same TL is a fairness defect, not a polish item.
3. **Anti-cheat tab is on contest-detail pages only**, not on homework assignment pages — the feature exists but is unreachable for the most common use case.
4. **Flat late penalty only** — academic standard is per-day decay; this is two SQL columns away.
5. **No LTI / LMS grade passback** — the single biggest institutional adoption blocker; without LTI 1.3, every weekly grade column is a manual CSV merge.

After 1–3 are fixed (~1 sprint), JudgeKit is plausible for a real course. After 5 is fixed (~weeks of work), it is competitive with PrairieLearn and Gradescope on coverage.

### Student exams (high-stakes, proctored) — NO-GO until proctoring lane is added

The architectural ceiling is acknowledged in `docs/exam-integrity-model.md`. Current build is fine for low-stakes exams (quizzes, formative assessment). For mid-terms or finals counting toward a grade, **pair JudgeKit with Safe Exam Browser or live human proctoring out-of-band**. Do not represent the in-product anti-cheat as exam-grade integrity.

### Recruiting coding tests — NO-GO until C-1 + C-6 + C-7 + H-1 + H-4 are shipped

These five together are the minimum for a defensible hiring product:
- C-1 binds submission ingestion to anti-cheat evidence (without this, decisions are not defensible).
- C-6 stops leaking the candidate's name pre-authentication.
- C-7 adds MFA for staff who can read every candidate submission.
- H-1 puts the employer's branding on the page so the candidate knows who is testing them.
- H-4 gives the candidate a results page so they leave the platform with a record of their performance.

Estimated work: 2 weeks of focused engineering. After that, JudgeKit is a credible answer to "should we use HackerRank or self-host." Without that work, hiring decisions made on this build can be challenged by any candidate aware of the integrity model — and the marketing copy that calls this a recruiting platform is materially overstated.

---

## Top-15 prioritized fix list (synthesized across all six reviews)

Ordered by `(impact × likelihood) ÷ effort`. P0 = fix this week. P1 = fix this sprint. P2 = fix this quarter.

| # | Pri | ID(s) | Title | Effort |
|---|---|---|---|---|
| 1 | P0 | C-2 | Set `CRON_SECRET` in `.env.production`; return 404 on missing config | 30 min |
| 2 | P0 | C-3 | Add `src/app/(public)/not-found.tsx`; verify status 404 not 200 | 30 min |
| 3 | P0 | C-4 | Strip `super_admin`/`admin`/`instructor` from public `/rankings` | 2 hr |
| 4 | P0 | H-11 | Fix playground 500-on-bad-shape; reconcile homepage "no sign-in required" copy | 4 hr |
| 5 | P0 | C-5 | Fix `assistant` capability bundle (swap `view_all` → `view_status`; add `comment`); honour `group_instructors.role='ta'` | 1 day |
| 6 | P0 | H-9 | Sidecar tokens `${VAR:?}` mandatory; hardcode worker compose BUILD/DELETE=0 | 1 day |
| 7 | P0 | H-6 | Verify daily backup cron/timer is actually running on algo | 1 hr |
| 8 | P1 | C-1 | Bind submission ingestion to live exam-session anti-cheat evidence | 3-5 days |
| 9 | P1 | C-6 | Defer recruit-page name disclosure until post-auth; strip from OG metadata | 4 hr |
| 10 | P1 | C-8 | Deploy a second judge worker before any high-stakes event | 1 day |
| 11 | P1 | H-2 | Per-language time-limit multipliers (schema + judge claim path) | 3 days |
| 12 | P1 | H-3 | Bulk student enrollment via CSV / textarea | 1 day |
| 13 | P1 | C-7 | TOTP/MFA for staff roles with `submissions.view_all` / `system.settings` | 1 week |
| 14 | P1 | H-1 | Recruit-page employer branding + recruiter contact email | 1 day |
| 15 | P2 | H-7, H-4, H-8, H-10, H-12, H-13 | Pre-restore backup; candidate results page; remove shared judge token; cap compile swap; public submissions feed; per-locale problem titles | ~2 sprints aggregate |

---

## Closing — what this platform is and isn't

**What JudgeKit IS today**: a competently engineered self-hosted online judge with multi-arch language coverage that competitors can't match (125 variants, AMD64 + ARM64), a sandbox tier above DOMjudge's default, a contest workflow that beats DOMjudge on anti-cheat depth and Codeforces on operator UX, and a codebase whose security-relevant primitives (Argon2id, CSP, ORM, atomic rate limiter, capability system) are above the bar for self-hosted projects.

**What JudgeKit ISN'T today**:
- A defensible recruiting product. The anti-cheat ceiling is documented but the marketing surface and recruit page do not yet concede it; the candidate-facing UX (no branding, name leak, no results page, no per-language fairness) reads as an internal tool re-skinned for external use.
- A high-stakes exam platform. Same architectural ceiling, same honest acknowledgement in `docs/exam-integrity-model.md`. Pair with SEB or live proctoring.
- A drop-in LMS replacement. No LTI, no bulk enrollment, no per-day late decay, no rubric grading, no aggregate semester gradebook export.

**The path from where it is to where it claims to be**: 2 weeks of focused engineering closes the recruiting NO-GO (C-1, C-6, C-7, H-1, H-4). One sprint closes the homework GO-WITH-CAVEATS (H-2, H-3, anti-cheat surfaced on homework pages, per-day late decay). The exam NO-GO is structural — the right answer is to ship a documented "honor-system + telemetry, not proctoring" mode and let operators pair it with SEB/proctoring out-of-band.

The codebase quality says this team can ship those fixes. The remaining question is whether the user-facing surface honestly tells customers what the platform is.

---

## Files in this review (2026-05-03)

| File | Perspective | Words | Verdict |
|---|---|---|---|
| `00-overall-verdict.md` | Aggregate (this file) | ~3.5k | 5.5 / 10 |
| `01-student.md` | Student | ~7.7k | 6.0 / 10 |
| `02-instructor.md` | Instructor | ~3.1k | 6.5 / 10 |
| `03-admin.md` | Admin / DevOps | ~5.5k | 6.0 / 10 |
| `04-assistant.md` | TA / Assistant | ~3.8k | 3.0 / 10 |
| `05-applicant.md` | Job applicant | ~6.5k | 5.0 / 10 |
| `07-security.md` | Security | ~6.5k | 5.5 / 10 |

Probe artefacts: `/tmp/judgekit-review/probe-evidence.md`, `/tmp/judgekit-review/screenshots/01-..18.png`. Each per-perspective review cites file:line throughout — these are not "vibes" reviews, they are evidence-based with reproduction.
