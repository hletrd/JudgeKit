# Overall Verdict — Multi-Perspective Review v2

**Date:** 2026-05-03
**Scope:** A blunt, multi-persona review of JudgeKit (HEAD) and the production deploy at `algo.xylolabs.com`, written for a user planning to use the platform for (1) recruiting coding tests, (2) classroom homework + exams, and (3) programming contests.
**Method:** Source-code audit across `src/`, `judge-worker-rs/`, `code-similarity-rs/`, `rate-limiter-rs/`, `docker/`, plus all `docs/` and prior `.context/reviews/` content. Live, headless-Chromium responsive testing on production (`algo.xylolabs.com`) across 15 viewports x 10 public pages, with vertical-resize and breakpoint sweeps. 215 screenshots captured.

**Companion files:**
- `01-student.md` — student perspective
- `02-instructor.md` — instructor perspective
- `03-admin.md` — system administrator perspective
- `04-assistant.md` — TA / assistant role perspective
- `05-applicant.md` — job applicant perspective
- `06-security.md` — adversarial security review
- `07-state-of-project.md` — state-of-project synthesis
- `08-responsive-live.md` — live responsive testing on `algo.xylolabs.com`
- `screenshots/` — 215 raw responsive captures

---

## TL;DR

JudgeKit is a **credible, honestly-documented self-hosted online judge** built by a team that has clearly survived production. Across seven independent perspectives, the same shape emerges:

- The submission engine, contest system, and sandboxing are **good to very good**.
- The team is **honest about limits** (the docs do not lie about anti-cheat or scaling).
- Recent commits (last ~30) have closed real issues, not cosmetic ones.
- **Production is behind HEAD.** Multiple routes that exist in source (`/signin`, `/privacy`, `/groups`) return 404 in production. Other gaps (admin name leakage, missing privacy page) flagged in April reviews are still missing on `algo.xylolabs.com`.
- A small set of **feature-level gaps** disqualifies specific high-stakes use cases: no MFA for staff, no lockdown-browser integration, no LMS / LTI, no autocomplete in the editor, no AI-generated-code detection.
- **Mobile UX has real, fixable defects** — most importantly a missing language switcher on `/login` and silently-truncated tables on `/practice`.
- Vertical viewport resizing on mobile **actually behaves well** for guests because the header is `position: static`, not sticky. (Authenticated submit panels were not testable signed-out and remain a follow-up.)

| Score | Aggregate |
|---|---|
| Student | 6.9 / 10 |
| Instructor (single course) | 6.5 / 10 |
| Instructor (institutional) | 3.0 / 10 |
| TA / Assistant | 3.7 / 10 |
| Job applicant (screening) | 7.0 / 10 |
| Job applicant (final round) | 5.0 / 10 |
| System administrator | 5.8 / 10 |
| Security (with MFA + external proctor) | 7.5 / 10 |
| Responsive UX (signed-out, public pages) | B- (~7.0 / 10) |

**Composite (unweighted): 6.0 / 10.** Real, useful, deployable for the right scope. Not a finished product.

---

## Use-case verdicts

### A. Recruiting coding tests

**Verdict: ⚠️ Conditional GO for screening, ❌ Decline for final-round without changes.**

What works:
- Recruit landing page is well-branded, honest, and shows language availability before the candidate commits.
- Token mechanics are cryptographically sound (24-byte base64url, SHA-256 hashed, atomic single-use redemption).
- Server-time-synced countdown defeats client-clock manipulation.
- Heartbeat freshness is enforced server-side at submit time (`a88f640b`) — closes the curl-only attack.
- Candidate results page exists with per-problem breakdown.
- Anonymized export option for recruiter review.
- Recruiting platform mode correctly hides Contests / Rankings / Groups and blocks the standalone compiler.
- Privacy page exists and is honest about telemetry.

What blocks final-round use today:
- **No MFA on recruiter / instructor / admin accounts.** A phished password = full access to all candidates and submissions.
- **No autocomplete / find-replace / bracket-close / vim mode in the editor.** A candidate is at a measurable speed disadvantage versus HackerRank / CoderPad / CodeSignal. `@codemirror/autocomplete` is a one-day enable.
- **No lockdown-browser integration.** A motivated candidate uses a second device + ChatGPT and the heartbeat keeps green throughout.
- **Code similarity does not detect AI-generated submissions.** Two independent ChatGPT outputs have low pairwise Jaccard similarity by construction.
- **`/login` has no language switcher** on production. A Korean candidate landing from an SMS link cannot switch to Korean before signing in.
- **No first-party data-subject-request endpoint** (privacy page directs candidates to email).

What you must do before scaled-up recruiting use:
1. Enable TOTP MFA for all accounts that can read candidate data or override scores.
2. Run external AI-detection on result review (third-party tooling — JudgeKit cannot do this on its own).
3. Add a LocaleSwitcher to `/login`.
4. Enable CodeMirror autocomplete + bracket-close + find/replace.
5. For final-round assessments, require Safe Exam Browser (SEB) or live human proctoring.

### B. Classroom assignments + exams

**Verdict: ✅ GO for autograded homework. ⚠️ Conditional for take-home exams. ❌ Decline for proctored synchronous exams without external proctoring.**

What works:
- Per-language time-limit multipliers (`e48c2f33`) — fair for Python and Kotlin students vs C++.
- KaTeX math in problem statements with strict mode + DoS caps.
- Bulk paste-list student enrollment.
- Assignment authoring with anti-cheat toggles, IOI/ICPC scoring, late penalty, due dates.
- Group-scoped TA visibility at the SQL trigger layer.
- Pre-restore snapshots and pre-deploy `pg_dump` retention.
- Server-time-synced countdown.
- Heartbeat freshness gate at submit time.

What blocks broader institutional use:
- **No LMS / LTI 1.3 integration.** Every weekly grade requires a CSV export → manual import. This is THE institutional adoption blocker. Without it, JudgeKit is a niche tool, not an official platform.
- **No rubric system** for partial-credit / subjective grading. Free text + an integer is not a rubric.
- **No per-day late penalty schedule.** Flat percentage only; the academic norm ("10% per day, max 5 days") is not expressible.
- **No per-student deadline extension UI** outside exam mode. Disability accommodations require manual DB edits.
- **No multi-section assignment fan-out.** Cloning across groups is not supported.
- **TA role is too narrow** for actual TA duties at most universities (cannot override scores, cannot author practice problems, cannot grant extensions).
- **No anonymous grading mode.**
- **No question bank / topic taxonomy** for problems.
- **No virtual contest mode** for past-contest practice.

What you must do before deploying for a course:
1. Accept that it will run beside, not inside, your LMS — at least for now.
2. Assign at least one `co_instructor` per group to handle TA-blocked actions (score overrides, individual extensions).
3. Use Gradescope or similar for any subjective / partial-credit grading.
4. Bring SEB or human proctoring for synchronous exams.

### C. Programming contests

**Verdict: ✅ GO for departmental / honor-system contests up to ~200 concurrent. ⚠️ Conditional for public reputational contests at 500+ concurrent.**

What works:
- ICPC + IOI scoring, both fully implemented end-to-end.
- Frozen leaderboards with live rank during freeze, podium highlighting.
- Per-language TL multipliers.
- Server-time-synced countdown.
- Submission queue position visible to participants.
- Anti-cheat tiered event model.
- Code similarity catches inter-contestant copy-paste with mild renaming.

What constrains scale:
- **Multi-instance app server is "warned about" in code and README.** `REALTIME_COORDINATION_BACKEND=postgresql` mode exists but the README explicitly says "still validate sticky-session and broader realtime scaling under the PostgreSQL-backed path... before claiming exam-grade or public-contest readiness". Until the team load-tests and signs off, you are running on a single VM.
- **Stop-then-start deploys** create a 1-3 minute outage. During a contest, this is a problem if a hotfix is needed.
- **No virtual contest mode** for individual practice on past contests.
- **No clarification system** scoped to contests in an obvious way.
- **AST-based plagiarism detection is missing.** Jaccard n-gram is competent for trivial copies; structurally-rewritten copies pass.

What you must do before a public-stakes contest:
1. Vertical-scale the single VM hard, accept blast radius.
2. Validate `REALTIME_COORDINATION_BACKEND=postgresql` at your expected concurrency before depending on it.
3. Have a rollback plan that does not require `docker compose down`.
4. Publish your similarity threshold and methodology so contestants understand the bar.

---

## What's clearly broken on production right now

These are flagged not as architectural concerns but as **deploy lag** — the codebase has fixes that production does not.

1. `/signin`, `/privacy`, `/groups` all return HTTP 404 on `algo.xylolabs.com`. Per `08-responsive-live.md` §2 note. The `(public)` route group in source includes a privacy page; production does not serve it.
2. `/login` has no LocaleSwitcher across all 12 captured viewports. Per `08-responsive-live.md` §5.1.
3. `/practice` table silently truncates columns 4-9 on mobile. Per `08-responsive-live.md` §5.2.
4. Header nav overlaps the theme icon at exactly 768 px. Per `08-responsive-live.md` §6.1.
5. 844 × 390 (phone landscape) renders desktop UI because the `md:` breakpoint is at 768 px. Per `08-responsive-live.md` §3.
6. Touch targets on hamburger / theme / locale toggles are 32-36 px versus 44 px iOS minimum. Per `08-responsive-live.md` §7.
7. Every page logs a CSP violation for `googletagmanager.com/gtag/js`. Per `08-responsive-live.md` §8.

These are quick fixes (hours, not days). Closing them before any external-facing recruiting or contest event is essential.

---

## What's structurally missing (sprints, not hours)

In rough order of impact:

1. **MFA / TOTP for staff accounts.** One sprint via Auth.js. Single highest-impact remaining security gap.
2. **LMS / LTI 1.3 integration with grade passback.** Institutional adoption blocker.
3. **CodeMirror feature pack** (autocomplete, bracket-close, find-replace, multi-cursor, vim/emacs, code folding). Half a sprint. Single biggest perceived-quality lift for recruiting.
4. **SEB / lockdown-browser integration as opt-in.** Two-week sprint. Unlocks final-round recruiting and proctored exams.
5. **Multi-instance app server validation.** Operator-driven load test + documented signoff.
6. **Rubric system + batch grading workflow.** Required for subjective course assignments.
7. **TA role expansion** (score override, individual extensions, problem authoring, discussion moderation, hidden-test visibility).
8. **Per-day late-penalty schedule UI.** Data model supports it; UI doesn't.
9. **Multi-section assignment fan-out.**
10. **AI-detection at result review** (third-party integration).
11. **Per-endpoint latency metrics + per-worker capacity metrics + a published Grafana dashboard JSON.**
12. **Automated daily backups + WAL-archive PITR.**
13. **Backup encryption at rest** (operator passphrase).
14. **Encrypt candidate PII (`candidateName`, `candidateEmail`) at rest.**
15. **Schedule the retention pruner** in production compose.
16. **Restrict the docker-socket-proxy to POST-only verbs.** Two hours.
17. **Magic-byte verification for non-image uploads.**
18. **Cryptographic challenge-response in heartbeat** to raise scripted-cheat cost.
19. **Email notifications** for deadlines and replies.
20. **Mobile cards for `/practice`** (mirror what `/rankings` and `/submissions` already do).

---

## What's good and worth keeping

These are non-trivial wins worth defending in any future refactor:

- **Server-time-synced countdown via `/api/v1/time`** with `dynamic = "force-dynamic"`. Defeats client-clock cheating.
- **Heartbeat freshness gate at submit time** (`a88f640b`).
- **Per-language TL multipliers** (`e48c2f33`).
- **Per-worker token hashing** (no shared `JUDGE_AUTH_TOKEN` fallback). Sidecar token enforcement via `${VAR:?}` in compose.
- **Pre-deploy `pg_dump` + pre-restore snapshot** with retention.
- **Honest documentation** — `docs/exam-integrity-model.md`, `docs/threat-model.md`, `docs/high-stakes-operations.md`. The team tells you what the platform cannot do.
- **Backup credential redaction** with `ALWAYS_REDACT` map.
- **Custom seccomp + cap-drop=ALL + read-only + no-network + tmpfs noexec + unprivileged user** in the judge sandbox.
- **PostgreSQL advisory locks** for heartbeat dedup across (eventual) multi-instance.
- **KaTeX with strict mode and DoS caps** — the correct way to ship math in user-controlled markdown.
- **Bulk paste-list student enrollment** — major workflow win for instructors.
- **Group-scoped TA visibility** enforced at SQL trigger layer.
- **Anonymized recruiter export** option — better than most competitors.
- **i18n at SUPPORTED_LOCALES = ["en", "ko"]** — Korean rendering works and is defended in `CLAUDE.md`.
- **Architecture detection per worker host** — no cross-arch image surprises.
- **`(*1)` from responsive review §3:** vertical resize is GOOD. Header is `position: static`, not sticky. Soft keyboard does not occlude.

---

## Two-sprint plan to "yes-yes-yes"

If the user wants this to be the *single* tool for recruiting + classroom + contests:

### Sprint 1 (security + recruiting credibility)
1. MFA / TOTP for staff
2. LocaleSwitcher on `/login`
3. CodeMirror autocomplete + bracket-close + find/replace + vim mode
4. Restrict docker-socket-proxy to POST-only
5. Encrypt candidate PII at rest
6. Magic-byte upload verification
7. Disable submission-cancel in exam mode
8. Schedule the retention pruner in production compose
9. Convert `/practice` to mobile card layout
10. Touch target audit (`size-8` → `size-11` on header buttons)
11. Push desktop-nav breakpoint from `md:` to `lg:` (fixes both 768-px overlap and 844x390 landscape)
12. Deploy HEAD to production (`/signin`, `/privacy`, `/groups`, redaction fixes from April)

### Sprint 2 (classroom + contest readiness)
1. SEB / lockdown-browser integration as opt-in per assignment
2. Validate `REALTIME_COORDINATION_BACKEND=postgresql` at concrete concurrency, document it
3. Per-endpoint latency metrics + per-worker metrics + Grafana JSON
4. Automated daily backups + WAL archiving
5. Backup encryption at rest
6. Per-day late penalty schedule UI
7. Per-student deadline extension UI outside exam mode
8. TA role expansion (score override, extensions, hidden-test visibility, problem authoring)
9. Rubric system MVP for partial-credit grading
10. Email notifications for deadlines and replies
11. Cryptographic heartbeat challenge-response
12. Bulk assignment fan-out across groups

After Sprint 1 the user can deploy for recruiting screening and departmental contests with confidence. After Sprint 2, JudgeKit becomes the kind of system a department can adopt at scale and a recruiting team can use for final rounds. LMS / LTI 1.3 remains the long-term institutional gap (Sprint 3+).

---

## Bottom line

**JudgeKit is a working, honest, well-engineered self-hosted online judge that has been deliberately under-marketed by its own documentation.** The team's recent work has been on real attack surface and real workflow gaps, not security theater or vanity features.

The platform is **already good enough for**:
- Departmental programming contests
- Single-course autograded homework
- Honor-system recruiting screening (with MFA on staff and external AI detection on review)
- Async take-home exams in low- to mid-stakes contexts

The platform is **not yet good enough for**:
- Final-round recruiting decisions without SEB / live proctoring
- Proctored high-stakes exams without external proctoring
- Institutional rollout that requires LMS integration
- Public reputational contests at 500+ concurrent without multi-instance validation
- Any "AI-free" marketing claim

The gap between "good enough" and "good enough for everything the user wants" is approximately **two sprints of disciplined feature work** — none of which is research. The architecture is sound, the documentation is honest, and the team has a track record of shipping fixes in response to real-world feedback.

**Use it for what it is. Don't use it for what it isn't. Watch for the team's next two releases.**
