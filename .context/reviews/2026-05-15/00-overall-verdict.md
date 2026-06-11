# JudgeKit Multi-Perspective Review — Overall Verdict

**Deployment**: https://algo.xylolabs.com (production)
**Date**: 2026-05-15
**Codebase**: /Users/hletrd/flash-shared/judgekit
**Method**: Full codebase audit (274 app files, 206 lib files, 104 components), Rust worker source, Docker configs, deploy scripts, security docs, test suites
**Reviewers**: 7 parallel perspectives (student, instructor, admin, assistant, applicant, security researcher, attacker)
**Stated use cases**: recruiting coding tests, student assignments, student exams, programming contests

---

## TL;DR — single-sentence verdict per stated use case

| Use case | Verdict | One-line reason |
|---|---|---|
| **Recruiting coding tests** | **CONDITIONAL GO** | Token-based candidate auth, recruiting-specific dashboards, and result-gating are real. But anti-cheat is still browser telemetry only; a prepared candidate can bypass the monitor with a second device. Use only for pre-screening, not final hiring decisions. |
| **Student exams (high-stakes, proctored)** | **NO-GO** | The heartbeat-freshness gate (90s) is a genuine improvement since 2026-05-03, but `docs/exam-integrity-model.md` still correctly calls this an "integrity telemetry" model, not proctoring. Safe Exam Browser or live proctoring remains mandatory. |
| **Student assignments (homework / honor-system)** | **GO** | Deadlines, late penalties, personal countdowns, and group-scoped assignments work. Per-language templates and detailed verdict feedback are pedagogically valuable. The missing pieces (bulk enroll, LMS integration) are operational conveniences, not blockers. |
| **Programming contests (closed/internal)** | **GO-WITH-CAVEATS** | IOI/ICPC scoring, leaderboard freeze, real-time SSE, and multi-worker claim logic are solid. Single-worker deployments are a hard SPOF; contest operators must pre-validate worker redundancy. |

**The honest framing**: JudgeKit has matured measurably in 12 days. The heartbeat-freshness check closes the most embarrassing integrity gap. The capability system is granular and well-considered. The Rust worker architecture is above-average for this category. What remains are (a) an integrity ceiling the recruiting surface should not oversell, (b) TA/assistant role gaps that undermine classroom scaling, and (c) a small set of sharp edges an attacker would find quickly.

---

## Scorecard

| Perspective | Score | One-line summary |
|---|---|---|
| Student (practice / homework / exam / contest) | **6.5 / 10** | Backend is strong; learning scaffolding is still thin; the 404 double-render and playground auth wall are still unfixed from cycle 1. |
| Instructor (homework / exam / contest) | **7.0 / 10** | Contest workflow is the strongest surface; homework needs bulk operations; code-similarity review is useful but not automated. |
| Admin / DevOps | **6.5 / 10** | Auth, audit, pre-restore snapshots, and deploy scripts are right; metrics endpoint still 503s in production, no MFA, worker SPOF unresolved. |
| TA / Assistant | **3.5 / 10** | `assistant` role has `submissions.comment` now (fixed since cycle 6), but `submissions.view_all` still bypasses group scope and score override still ignores `ta` role. The role is half-functional. |
| Job applicant (recruiting flow) | **5.5 / 10** | Token auth, candidate dashboard, and results-gating are real. OG metadata leaks platform name, no GDPR data-subject path, and the anti-cheat gap means results are "advisory" not "proof." |
| Security researcher (defensive) | **6.5 / 10** | Sandbox layering, CSRF, rate-limiting, and credential crypto are above-average. The anti-cheat model is correctly scoped. One CRITICAL operational config remains broken in production. |
| Attacker (offensive / red-team) | **7.0 / 10** | The platform would frustrate an opportunistic attacker: Docker sandbox, seccomp, no network, parameterized queries, CSRF tokens. A determined attacker finds gaps: timing-side user enumeration mitigated by dummy hash, but username/email case-insensitive lookup is a subtle oracle. |
| **Overall** | **6.0 / 10** | A genuinely competent system with honest documentation about its limits. Not yet finished for high-stakes use cases, but the trajectory is correct. |

---

## Cross-cutting CRITICAL items

### C-1 — Anti-cheat is telemetry, not evidence (architectural ceiling)
**Source**: security researcher + attacker + applicant + student exam-mode.
**Where**: `docs/exam-integrity-model.md`, `src/lib/assignments/submissions.ts:54` (`ANTI_CHEAT_HEARTBEAT_FRESHNESS_MS`).
The 90-second heartbeat freshness gate is a real improvement. It closes the "submit from curl while browser idles" attack. What it does NOT close: (a) candidate keeps monitor in hidden tab on laptop A while solving on laptop B, (b) AI-generated code typed at normal cadence, (c) candidate shares screen via Zoom to a helper. The docs say this explicitly; the marketing/recruiting surface should too.
**Required**: A one-line disclaimer on every recruit-start page: "This assessment uses browser behavior monitoring. It is an advisory review aid, not proof of misconduct."
**ETA**: 30 minutes.

### C-2 — `/api/metrics` still returns 503 in production (12-day regression)
**Source**: admin + security researcher.
**Where**: `src/app/api/metrics/route.ts:33`.
Live probe as of 2026-05-15: `curl https://algo.xylolabs.com/api/metrics` → `503 {"error":"CRON_SECRET not configured"}`. This has been noted in every review cycle since May 3. The env var name is leaked in the error body. The deploy script does not enforce `CRON_SECRET`. This is not a security bug; it is an operational culture bug — a broken observability surface that invalidates the production readiness claim.
**Fix sketch**: Add `CRON_SECRET` to `.env.production`, change missing-secret branch to 404, add startup gate in `instrumentation.ts`.
**ETA**: 30 minutes.

### C-3 — Assistant role still sees cross-group submissions (HIGH)
**Source**: assistant + instructor.
**Where**: `src/lib/capabilities/defaults.ts:15-28`, `src/lib/assignments/submissions.ts:165-179`.
`submissions.view_all` is in `ASSISTANT_CAPABILITIES`. The group-scope filter at `getSubmissionReviewGroupIds` only activates when the capability is ABSENT. Because assistants have `view_all`, the filter is a no-op. A TA for CS101 sees every submission from Physics301. This is a data-boundary violation.
**Fix sketch**: Remove `submissions.view_all` from `ASSISTANT_CAPABILITIES`. The group-scope filter will then restrict to assigned teaching groups automatically.
**ETA**: 2 hours (including test updates).

### C-4 — Score override ignores `ta` role in `group_instructors` (HIGH)
**Source**: assistant + instructor.
**Where**: `src/lib/assignments/management.ts:82-85` (`canManageGroupResourcesAsync`).
The function only checks `role === "co_instructor"`. `ta` is treated as a cosmetic label. A TA with `group_instructors.role='ta'` cannot override scores or manage group resources, even though they are listed as an instructor for that group.
**Fix sketch**: Change the check to `role === "co_instructor" || role === "ta"`.
**ETA**: 15 minutes.

### C-5 — No MFA on any account tier (HIGH)
**Source**: security researcher + attacker + admin.
**Where**: `src/lib/auth/config.ts`, `docs/admin-security-operations.md`.
There is no TOTP, no WebAuthn, no SMS fallback, no OAuth2 SSO. The strongest account (`super_admin`) is protected by the same password-only flow as a student. A single credential-stuffing hit on `admin` (username disclosed in rankings, see C-6) owns the entire platform.
**Fix sketch**: Add TOTP to the credentials provider flow; gate high-risk actions (settings changes, backup restore, role assignment) on MFA verification.
**ETA**: 3-5 days.

### C-6 — Admin username still disclosed on public `/rankings` (HIGH)
**Source**: security researcher + attacker + student.
**Where**: `src/app/(public)/rankings/page.tsx`.
The `admin` user with display name "Super Admin" and Diamond tier is still rendered to anonymous visitors. This is a credential-stuffing target advertisement. Combined with C-5 (no MFA), the attack path is: (1) discover `admin` exists, (2) spray passwords, (3) own platform.
**Fix sketch**: Filter out `admin`, `super_admin`, and `instructor` roles from public rankings.
**ETA**: 15 minutes.
