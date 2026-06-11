# Multi-Persona Review Aggregate — 2026-04-20

**Scope**: JudgeKit reviewed from 6 professional perspectives: Student, Instructor, Admin, TA/Assistant, Job Applicant, and Security Researcher. This document synthesizes cross-cutting themes and prioritized action items.

## Individual Review Scores

| Persona | Rating | File |
|---|---|---|
| Student | — (3 critical frustrations) | `persona-student-2026-04-20.md` |
| Instructor | 3.2/5 | `persona-instructor-2026-04-20.md` |
| Admin | 5.6/10 | `persona-admin-2026-04-20.md` |
| TA/Assistant | — (1 critical capability gap) | `persona-assistant-2026-04-20.md` |
| Job Applicant | 7/10 | `persona-applicant-2026-04-20.md` |
| Security | MEDIUM overall risk | `persona-security-2026-04-20.md` |

---

## Cross-Cutting Themes

### 1. CodeMirror Editor Is Underconfigured (4 of 6 personas flagged)

Every user who touches the editor notices the same thing: no autocomplete, no bracket auto-closing, no linting, no error highlighting. The CodeMirror 6 infrastructure is there but the `@codemirror/autocomplete` and `closeBrackets` extensions are simply not loaded (`src/components/code/code-surface.tsx`). In 2026 this is table-stakes — every competitor (LeetCode, HackerRank, CodeSignal) has it. This single fix would improve the experience for students, applicants, and instructors simultaneously.

### 2. Exam Timer Disappears During Problem Navigation (Student-critical)

The `CountdownTimer` only renders on the assignment overview page, not on the problem detail/code page (`src/app/(dashboard)/dashboard/problems/[id]/page.tsx`). During a timed exam, students lose visibility of remaining time the moment they start coding. This is the single most dangerous UX bug from the student perspective.

### 3. TA Role Is Broken (Instructor + TA both flagged)

The `assistant` role lacks `submissions.comment` capability (`src/lib/capabilities/defaults.ts:15-28`). TAs can view code but cannot give feedback — defeating their core purpose. The group-level "ta" role appears to be cosmetic and disconnected from the capability system. Instructors notice they can't delegate grading; TAs notice they can't do their job.

### 4. Feedback Opacity (Student + Applicant + Instructor)

When `showDetailedResults` is false, students get literally no diagnostic information on wrong answers. The diff infrastructure (`OutputDiffView`) exists but is gated behind per-problem flags. Meanwhile, AI auto-review only runs on accepted submissions — the students who need help most (WA, RE, TLE) get zero AI feedback. The instructor perspective confirms there's no rubric system or structured feedback workflow for manual grading either.

### 5. Anti-Cheat Privacy Overreach (Applicant + Security)

The anti-cheat monitor captures up to 80 characters of copied text content (`anti-cheat-monitor.tsx:160-178`). Competitors log that a copy event occurred, not what was copied. Combined with silent code snapshots every 10-60 seconds with `.catch(() => {})` and no UI indicator, this creates a privacy concern — especially for recruiting scenarios where candidates are evaluating the employer through the platform.

### 6. Deployment & Scalability Gaps (Admin-critical)

- No automated scheduled backups (compliance risk for exam-grade data)
- Every deploy is an outage — no blue-green, no connection draining
- Default `DATABASE_POOL_MAX=20` and `SUBMISSION_GLOBAL_QUEUE_LIMIT=200` are too low for 500+ concurrent exam users
- SSE is process-local with no backpressure or horizontal scaling path

### 7. Judge Security Default-Allow (Security-critical)

`JUDGE_ALLOWED_IPS` defaults to allowing all IPs (`src/lib/judge/ip-allowlist.ts:77-83`). If the shared `JUDGE_AUTH_TOKEN` leaks, an attacker from any network position can report fake verdicts, register rogue workers, or claim submissions — directly threatening contest and exam integrity.

---

## Prioritized Action Items

### P0 — Fix Immediately (Integrity & Safety)

| # | Issue | Personas Affected | Effort |
|---|---|---|---|
| 1 | Judge API IP allowlist defaults to allow-all | Security, Admin | S |
| 2 | TA role missing `submissions.comment` capability | Instructor, TA | S |
| 3 | Exam timer must be visible on problem/code pages | Student | M |
| 4 | Anti-cheat should not capture copied text content | Applicant, Security | S |

### P1 — Fix This Sprint (Core UX)

| # | Issue | Personas Affected | Effort |
|---|---|---|---|
| 5 | Enable CodeMirror autocomplete + bracket closing | Student, Applicant, Instructor | S |
| 6 | Add "stay on problem" option after submission | Student | M |
| 7 | Show at least partial feedback on WA (e.g., which test case index, not I/O) | Student, Applicant | M |
| 8 | AI auto-review should also run on WA/RE/TLE submissions | Student, Instructor | M |
| 9 | Leaderboard/clarifications should use SSE instead of 30s polling | Student | M |

### P2 — Fix This Quarter (Operational & Scaling)

| # | Issue | Personas Affected | Effort |
|---|---|---|---|
| 10 | Automated scheduled database backups | Admin | M |
| 11 | Blue-green or rolling deploy strategy | Admin | L |
| 12 | Tune DB pool / queue limits for 500+ concurrent users | Admin | M |
| 13 | Raw SQL in judge claim — migrate to Drizzle query builder | Security | M |
| 14 | Timing oracle in worker authentication — constant-time path | Security | S |
| 15 | Add TLS for worker ↔ app communication | Security | M |

### P3 — Strategic Investments (Competitive Positioning)

| # | Issue | Personas Affected | Effort |
|---|---|---|---|
| 16 | Manual grading: rubrics, batch workflow, anonymous mode | Instructor, TA | L |
| 17 | Problem description rich editor (toolbar, KaTeX shortcuts, table builder) | Instructor | L |
| 18 | CSV import for user enrollment and roster upload | Instructor | M |
| 19 | Code similarity: side-by-side diff view, AST-based comparison | Instructor | L |
| 20 | Structured problem format (Input/Output/Examples/Constraints sections) | Applicant, Student | M |
| 21 | Mobile-responsive code editor | Student | L |
| 22 | GDPR cookie consent before loading analytics | Applicant | M |

---

## What's Genuinely Strong

These features were praised across multiple personas and represent competitive advantages:

- **Judging feedback pipeline**: Real-time progress bars, queue position display, side-by-side diff views for WAs — best-in-class vs LeetCode/HackerRank
- **Rust judge worker lifecycle**: Registration, heartbeat, graceful shutdown, dead letter recovery — production-grade
- **Contest system**: IOI + ICPC scoring, leaderboard freeze, clarifications, access codes, recruiting invitations — competition-grade
- **Multi-tier rate limiting**: nginx + Rust sidecar + PostgreSQL with atomic transactions — well-layered
- **Anti-cheat infrastructure**: Tiered review model, heartbeat gap detection, similarity checks — thoughtful for self-hosted
- **Editor customization**: 30+ themes, 9 font families, configurable sizes — unmatched
- **Audit event system**: Batched writes, break-glass access, legal hold, retention policies — compliance-ready
- **Argon2id password hashing**: OWSP-recommended parameters, transparent bcrypt migration — cryptographic best practice

---

*Reviews generated 2026-04-20 from source at commit `2af713d`.*
