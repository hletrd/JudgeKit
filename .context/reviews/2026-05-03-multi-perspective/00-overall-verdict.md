# JudgeKit Multi-Perspective Review — Overall Verdict

**Deployment**: https://algo.xylolabs.com (production)
**Date**: 2026-05-03
**Method**: Full codebase audit (src/ + judge-worker-rs/ + sidecars + Docker + deploy) + live UI probing at mobile/tablet/desktop viewports + git history since April 17 (1635 commits)
**Baseline comparison**: Earlier review at `.context/reviews/2026-05-03/` (live probe) and `.context/reviews/00-overall-verdict.md` (April 17 code review)
**Stated use cases**: recruiting coding tests · student assignments · student exams · programming contests

---

## TL;DR — single-sentence verdict per stated use case

| Use case | Verdict | One-line reason |
|---|---|---|
| **Recruiting coding tests** | **GO-WITH-CAVEATS** (was NO-GO) | Anti-cheat heartbeat now enforced server-side; candidate results page exists; employer branding present. Remaining gaps: no MFA for staff, no lockdown browser, candidate name still leakable in edge cases. |
| **Student exams (high-stakes, proctored)** | **GO-WITH-CAVEATS** (was NO-GO) | Heartbeat enforcement closes the curl-only attack. Still not a replacement for Safe Exam Browser / live proctoring — the integrity model doc is honest about this. |
| **Student assignments (homework / honor-system)** | **GO** (was GO-WITH-CAVEATS) | Bulk enrollment, per-language time multipliers, anti-cheat on homework, group-scoped assistant role — the operational blockers are resolved. |
| **Programming contests (closed/internal honor-system)** | **GO** (unchanged) | Contest system remains the strongest surface; second worker documented, CRON_SECRET fixed, 404 chrome fixed, staff excluded from rankings. |

The honest framing: **JudgeKit has closed nearly every CRITICAL and HIGH gap identified in the April 17 review in roughly 2 weeks of focused engineering.** The remaining items are HIGH (MFA, lockdown browser) and MEDIUM (virtual contest, LTI integration, rubric grading). The platform is now defensible for recruiting and low-stakes exams; high-stakes exam use still requires external proctoring, which the documentation honestly states.

---

## Scorecard — compared to April 17 baseline

| Perspective | April 17 | May 3 | Delta | Key improvement |
|---|---|---|---|---|
| Student | 7.5/10 | **7.5/10** | = | Per-language TL multipliers, 4s cancel window, platform-aware shortcuts. Mobile still weak. |
| Instructor | 7/10 | **8/10** | +1 | Bulk enrollment, per-language TL, group-scoped TA, anti-cheat on homework, analytics |
| Admin | 6/10 | **7.5/10** | +1.5 | Backup sanitization, pre-restore snapshot, CRON_SECRET fix, sidecar tokens mandatory, in-memory rate limiter removed, SECURITY.md, compile swap cap |
| TA/Assistant | 6.5/10 (3/10*) | **7/10** | +0.5/- | Group-scoped access, comment/rejudge/similarity capabilities. Still no score override. |
| Job Applicant | 6/10 | **7/10** | +1 | Results page, employer branding, language list, honest anti-cheat disclosure, AI honesty notice |
| Security | 6.5/10 (5.5/10*) | **7.5/10** | +1/+2 | Heartbeat enforcement, backup redaction, sidecar tokens mandatory, compile swap cap, dockerfilePath anchoring, seccomp for compile, removed shared judge token fallback |
| **Overall** | **6.8/10** (5.5/10*) | **7.5/10** | +0.7/+2 | From "competent but not ready for stated use cases" to "defensible with documented caveats" |

*April 17 scores in the first column use the older review format; the parenthetical uses the May 3 live-probe review which was harsher due to production misconfigurations that are now fixed.

---

## What changed since April 17 review (1635 commits)

### CRITICAL → FIXED
- **Anti-cheat heartbeat enforcement**: `submissions.ts:298-316` now rejects exam submissions unless a fresh anti-cheat event exists (≤60s). Closes the curl-only attack path (was C-1/F1).
- **Backup always redacts passwords/sessions/API keys**: `ALWAYS_REDACT` in `export.ts:256-262` ensures password hashes, session tokens, and encrypted API keys are nullified even in full-fidelity exports. Was CRITICAL.
- **CRON_SECRET leak fixed**: `metrics/route.ts:32-38` returns 401 (not 503 with env var name) when unconfigured. Was CRITICAL operational.

### HIGH → FIXED
- **Staff excluded from public rankings**: `rankings/page.tsx:73` filters `u.role NOT IN ('super_admin', 'admin', 'instructor')`. Was C-4.
- **404 double-rendered chrome fixed**: `src/app/(public)/not-found.tsx` added. Was C-3.
- **Assistant role scoped to groups**: `defaults.ts:15-34` omits `submissions.view_all`, adds `submissions.comment`, `submissions.rejudge`, `anti_cheat.run_similarity`. Was C-5.
- **Sidecar auth tokens mandatory**: `rate-limiter-rs` and `code-similarity-rs` reject startup without `*_AUTH_TOKEN`. Was F3.
- **Compile swap capped at memory limit**: `docker.rs` no longer allows 4 GiB swap. Was F7.
- **Shared JUDGE_AUTH_TOKEN fallback removed**: Per-worker tokens enforced. Was H-8.
- **Pre-restore snapshot**: `restore/route.ts` takes `pg_dump` before import. Was H-7.
- **In-memory rate limiter removed**: Dead code eliminated; DB-backed rate limiter is the only path. Was F-HIGH.
- **dockerfilePath prefix anchoring**: `buildDockerImageLocal` validates `startsWith("docker/Dockerfile.")` + `judge-` infix. Was security F9/F28.
- **Bulk student enrollment**: `group-members-manager.tsx` supports paste-list (newline/comma/semicolon/tab-separated). Was H-3.
- **Per-language time-limit multipliers**: `languageConfigs.timeLimitMultiplier` in schema + judge claim path. Was H-2.
- **Candidate results page**: `/recruit/[token]/results` with per-problem breakdown, score summary, auth-gated. Was H-4.
- **Employer branding on recruit page**: `organizationName`, `organizationLogoUrl`, `contactEmail` columns and rendering. Was H-1.
- **Privacy page**: `/privacy` with data classes, retention windows, rights, contact. Was H-5 (partial).
- **SECURITY.md + /.well-known/security.txt**: Vulnerability reporting policy. Was missing.
- **Honest anti-cheat disclosure to candidates**: AI honesty notice on recruit page. Was applicant trust gap.
- **Platform-aware submit shortcut**: Cmd+Enter on Mac, Ctrl+Enter elsewhere. Was student F1.
- **4-second cancel window for submissions**: Undo button after submit. Was student frustration.

### Still open (HIGH)
- **No MFA/TOTP for staff accounts**: The single most impactful remaining gap. Admin + instructor accounts with `system.backup`, `submissions.view_all` capabilities sit behind single-factor passwords. For recruiting, this is a trust deficit.
- **No lockdown browser / Safe Exam Browser integration**: Heartbeat enforcement raises the bar, but a determined candidate with a second device and the browser open still passes. The exam-integrity-model doc is honest about this.
- **No virtual contest mode**: Students cannot practice past contests with the same time constraints.
- **No LMS integration (LTI 1.3)**: The biggest institutional adoption blocker. No grade passback to Canvas/Moodle.

### Still open (MEDIUM)
- **Candidate name still shown pre-auth in edge case**: `recruit/[token]/page.tsx:119` shows `t("welcome", { name })` for `resumeWithCurrentSession`. For new visitors, only `t("description")` is shown (generic). This is an improvement but the resume path still leaks name via OG metadata in `generateMetadata` — though that now uses generic `t("ogDescription")` instead of candidate name. **Partially fixed.**
- **No rubric-based grading**: Manually-graded problems lack structured rubrics.
- **No assignment duplication/cloning**: Cannot reuse assignments across semesters.
- **Flat late penalty only**: No per-day decay.
- **Mobile UX still weak**: Sticky code panel, side-by-side diff on small screens, no card views for some tables.
- **No per-student deadline extensions UI**: Data model supports it, UI doesn't.

---

## Cross-cutting strengths — unchanged or improved

1. **Sandbox layering is best-in-class for self-hosted OJs.** `--network=none`, `--cap-drop=ALL`, `--security-opt=no-new-privileges`, `--read-only`, custom seccomp profile, `--user 65534:65534`, `--pids-limit 128`, `--init`, atomic claim with `FOR UPDATE SKIP LOCKED`, compile swap capped at memory limit. Better than DOMjudge's default profile.
2. **Auth & crypto are right.** Argon2id with OWASP parameters, anti-enumeration, JWT invalidation, three-layer CSRF, DB-backed atomic rate limiter with `SELECT FOR UPDATE`.
3. **Anti-cheat is now server-enforced for exams.** The heartbeat freshness check closes the architectural gap. Combined with the honest disclosure to candidates and the documented integrity model, this is defensible for honor-system use.
4. **Capability-based authorization with group scoping.** 43+ capabilities, custom roles, group-scoped assistant role, API key role is `min(key.role, creator.role)`.
5. **Backup always redacts credentials.** The `ALWAYS_REDACT` map is a solid design — even disaster-recovery exports are safe to share.
6. **Contest system remains the crown jewel.** ICPC + IOI scoring, freeze, replay, analytics, recruiting mode, CSV export with anti-cheat counts.
7. **Candidate experience is much improved.** Results page, employer branding, language list, 4s undo, platform-aware shortcuts, honest AI disclosure.
8. **Operational posture improved.** SECURITY.md, security.txt, pre-restore snapshot, mandatory sidecar tokens, removed dead rate limiter, compile swap cap, dockerfilePath anchoring.

---

## Top 10 priority actions (remaining)

| # | Pri | Title | Impact | Effort |
|---|---|---|---|---|
| 1 | P0 | Add TOTP/MFA for staff roles with `system.backup` or `submissions.view_all` | HIGH | 1 week |
| 2 | P0 | Add Safe Exam Browser integration / lockdown browser documentation | HIGH | 2 days (docs) / 2 weeks (integration) |
| 3 | P1 | Add virtual contest mode for past contest practice | HIGH | 1 week |
| 4 | P1 | Add LTI 1.3 integration (grade passback) | HIGH | 3-4 weeks |
| 5 | P1 | Add rubric-based grading for manually-graded problems | HIGH | 2 weeks |
| 6 | P1 | Add assignment duplication/cloning | MEDIUM | 2 days |
| 7 | P1 | Add per-student deadline extensions UI | MEDIUM | 3 days |
| 8 | P1 | Add per-day late penalty decay | MEDIUM | 2 days |
| 9 | P2 | Improve mobile UX (sticky panel, diff fallback, card views) | MEDIUM | 1 week |
| 10 | P2 | Add submission feedback / inline comments for TAs | MEDIUM | 1 week |

---

## Files in this review

| File | Perspective | Words | Score |
|---|---|---|---|
| `00-overall-verdict.md` | Aggregate (this file) | ~3k | 7.5/10 |
| `01-student.md` | Student | ~2.5k | 7.5/10 |
| `02-instructor.md` | Instructor | ~2.5k | 8/10 |
| `03-admin.md` | Admin / DevOps | ~2k | 7.5/10 |
| `04-assistant.md` | TA / Assistant | ~2k | 7/10 |
| `05-applicant.md` | Job applicant | ~2.5k | 7/10 |
| `07-security.md` | Security / adversarial | ~3k | 7.5/10 |
