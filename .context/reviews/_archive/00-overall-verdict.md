# JudgeKit Multi-Perspective Review — Overall Verdict

**Date**: 2026-04-17 (Post-Plan-008 Fixes)
**Review Scope**: Student, Instructor, Admin, Assistant/TA, Job Applicant, Contest Organizer, Security
**Project**: JudgeKit — Online Judge Platform for Education, Contests, and Recruiting

---

## Score Summary

| Perspective | Score | One-Line Verdict |
|---|---|---|
| Student | 7.5/10 | Solid contest and submission UX, improved feedback but educational scaffolding still thin |
| Instructor | 7/10 | Good assignment/contest management, analytics now functional, course management gaps remain |
| Admin | 6/10 | Better backup/restore and health monitoring, still missing production ops tooling |
| TA/Assistant | 6.5/10 | Built-in assistant role added, but group-level TA permission gaps persist |
| Job Applicant | 6/10 | Functional test-taking, privacy and feedback gaps are concerning |
| Contest Organizer | 8/10 | Best-in-class contest system with replay, analytics, recruiting mode |
| Security | 6.5/10 | Good auth/CSP foundations, Docker proxy restricted, but anti-cheat and judge auth still weak |
| **Overall** | **6.8/10** | Strong contest platform making progress on education/recruiting; anti-cheat is the critical gap |

---

## What Changed Since Last Review (Plan 001-008 Fixes)

### Fixed
- Docker socket proxy restricted to CONTAINERS=1 only (was BUILD+IMAGES+POST+DELETE)
- Built-in `assistant` role added with view-only capabilities (submissions, assignments, users, problems, anti_cheat, files)
- Per-worker judge auth token support added (`isJudgeAuthorized` validates workerId-specific tokens)
- IP allowlist for judge API routes (`JUDGE_ALLOWED_IPS` env var)
- ZIP bomb protection on file uploads (decompressed size validation)
- DOMPurify sanitization for HTML/Markdown problem descriptions
- IDOR fix for non-assignment submissions (group membership check)
- Class analytics dashboard at `/dashboard/groups/:id/analytics`
- Backup now includes file uploads (ZIP archive with `database.json` + `uploads/`)
- Diff view for failing test case output (unified + side-by-side)
- Health endpoint at `/api/v1/health` with rate limiting, DB check, uptime
- Batch test case upload via ZIP was already implemented
- Data retention cleanup for audit/login/anti-cheat events
- Output truncation with show more/less toggle for long judge output
- Touch target improvements (44px icon buttons, 40px inputs/selects, 40px pagination)
- Accessibility: skip links, breadcrumbs, aria-current, focus trap, skeleton loading
- Audit log filters (action type, date range)
- Admin submissions sorting by column headers
- formatScore utility for consistent score display
- Mobile status board card view for assignments
- KaTeX math rendering in problem descriptions
- Privacy notice for anti-cheat monitoring
- Submission feedback toast on successful creation

### Still Broken
- Anti-cheat remains client-side-only JavaScript — trivially bypassed
- No lockdown browser or proctoring integration
- No educational scaffolding (hints, rubrics, progress tracking)
- TA permissions at group level still don't differentiate from instructor
- No Prometheus/Grafana monitoring integration
- No 2FA for admin/instructor accounts
- No per-language time limit multipliers
- No virtual contest mode
- No LMS integration

---

## Cross-Cutting Strengths

1. **Contest system is genuinely excellent** — dual scoring models (ICPC/IOI), freeze periods, animated replay, analytics, recruiting mode with token-based access. This is the platform's crown jewel.
2. **Authentication is done right** — Argon2id with OWSPA parameters, anti-enumeration, JWT invalidation, rate limiting, CSP with per-request nonces.
3. **Code execution pipeline is well-architected** — Docker socket proxy (now restricted), seccomp, resource limits, atomic claim with `FOR UPDATE SKIP LOCKED`. Better than most self-hosted OJ platforms.
4. **Capability system is flexible** — 38 capabilities, custom roles, assistant role added. Can grow with the platform.
5. **Rust sidecars** — judge worker, code similarity, and rate limiter in Rust show serious engineering investment.
6. **i18n** — Full Korean + English support with 140KB+ translation files.
7. **Diff view now functional** — LCS-based line diff for failing test cases with unified/side-by-side modes.

---

## Cross-Cutting Weaknesses

### 1. Anti-Cheat Is Theatrical, Not Real (Security + Applicant + Student)

Client-side JavaScript monitoring provides zero actual security. It deters honest students but is trivially bypassed by disabling JavaScript, using a second device, or spoofing events. The privacy notice is now shown (good), but the underlying mechanism is still security theater.

For a platform used for **recruiting and exams**, this is the most critical gap. Code similarity detection only catches the laziest plagiarism. Needs: Safe Exam Browser integration, server-side anomaly detection, optional proctoring.

### 2. Educational Scaffolding Still Thin (Student + Instructor)

The platform treats all users like competitive programmers. Missing:
- Hints system (incremental hints per problem)
- Rubric-based grading for manually-graded problems
- Student progress tracking (solved/attempted/unsolved over time)
- Assignment templates and cloning
- LMS integration (LTI, Canvas, Moodle)
- Per-language time limit multipliers

The new analytics dashboard helps instructors, but students still lack personalized learning paths.

### 3. TA Permissions Are Group-Level Broken (TA + Instructor)

The `assistant` built-in role was added system-wide, but the `group_instructors` table still has `ta` and `co_instructor` entries whose role is ignored by most permission checks. A TA added to a specific group still gets either student-level or instructor-level access — nothing in between.

### 4. Observability Gap Persists (Admin + Security)

The health endpoint is a start, but there is **no monitoring, no alerting, no metrics dashboard**. Production operations are still flying blind. The health endpoint checks DB connectivity and reports uptime, but there's no Prometheus export, no Grafana dashboard, no alerting for worker failures or queue depth.

### 5. Judge Worker Auth: Improved But Still Single-Token Fallback (Security)

Per-worker tokens were added, but the shared `JUDGE_AUTH_TOKEN` remains as a fallback for unregistered workers. If the token leaks, an attacker can still submit fabricated results or exfiltrate test data. IP allowlisting helps but is not defense-in-depth.

---

## Suitability Assessment by Use Case

### Programming Contests: 8.5/10 — Ready

The contest system is mature and improved with replay, analytics, and recruiting mode. Gaps:
- No virtual contest mode for practice
- No contest editorial system
- No per-language time limit multipliers

### Student Assignments: 5.5/10 — Needs Work

Some improvements (analytics, diff view, mobile status board). Critical gaps:
- No rubric/grading system for manually-graded work
- No assignment templates/cloning
- No LMS integration
- Per-language time limits not supported

### Exams: 4.5/10 — Not Ready for High-Stakes

Anti-cheat remains the fundamental integrity gap:
- Client-side-only anti-cheat is insufficient
- No lockdown browser integration
- No proctoring
- No 2FA for exam access
- Acceptable for low-stakes quizzes only

### Recruiting/Coding Tests: 6.5/10 — Functional With Caveats

Recruiting mode works well. Concerns:
- Anti-cheat inadequate for high-stakes evaluation
- No post-assessment score summary for candidates
- Privacy: IP tracking present, privacy notice shown, but no data retention policy for candidates
- Code similarity doesn't catch AI-generated or refactored submissions

---

## Top 10 Priority Actions

| # | Action | Impact | Effort | Status |
|---|---|---|---|---|
| 1 | Implement server-side anti-cheat anomaly detection | Critical | High | Not started |
| 2 | Add Safe Exam Browser / lockdown browser integration | Critical | High | Not started |
| 3 | Add 2FA for admin/instructor accounts | High | Medium | Not started |
| 4 | Fix TA permissions at group level (respect group_instructors.role) | High | Medium | Not started |
| 5 | Add Prometheus metrics export + Grafana dashboard | High | Medium | Not started |
| 6 | Add rubric-based grading for manually-graded problems | High | High | Not started |
| 7 | Add per-language time limit multipliers | High | Medium | Not started |
| 8 | Add assignment templates and cloning | Medium | Medium | Not started |
| 9 | Add virtual contest mode | Medium | Medium | Not started |
| 10 | Add LMS integration (LTI 1.3) | Medium | High | Not started |

---

## Files in This Review

| File | Perspective |
|---|---|
| `01-student.md` | Student (coursework, exams, contests) |
| `02-instructor.md` | Instructor (course creation, grading) |
| `03-admin.md` | System Administrator (ops, deployment) |
| `04-assistant.md` | TA/Assistant (grading, moderation) |
| `05-applicant.md` | Job Applicant (recruiting tests) |
| `06-contest-organizer.md` | Contest Organizer (ICPC/IOI events) |
| `07-security.md` | Security Researcher (adversarial audit) |
