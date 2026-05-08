# Instructor Review — JudgeKit (algo.xylolabs.com) — 2026-05-03

**Reviewer persona**: CS instructor, ~150 students, weekly homework assignments, one mid-term exam, end-of-term contest  
**Sources**: live probe evidence (`probe-evidence.md`), codebase (`src/`), prior review (`.context/reviews/02-instructor.md`)  
**Method**: read page components, route handlers, schema, scoring logic, anti-cheat, plugins, and docs  

---

## Verdict by Use Case

| Use case | Score | Summary |
|---|---|---|
| Weekly homework | **6 / 10** | Core loop works; CSV export exists; late penalty is one-shot flat, not tiered; no per-language time multipliers; no bulk-enroll; anti-cheat disabled for homework by default |
| Mid-term exam | **7 / 10** | Windowed exam with personal countdown timer, anti-cheat events, IP tracking are genuinely solid; single worker = SPOF; manual score override exists; no partial-credit rubric |
| End-of-term contest | **8 / 10** | Best-supported workflow: ICPC + IOI scoring, freeze, replay, rich analytics, CSV + JSON export, announcements + clarifications, anti-cheat dashboard; good enough for a real contest |
| **Overall adoption** | **6.5 / 10** | Strong contest core, course-management layer needs one semester of hardening first |

---

## Top 5 Strengths

1. **Language breadth** (`docs/languages.md`). 125 variants with E2E-tested AMD64 + ARM64 images covering C, C++, Java, Python 3.14, PyPy, Rust, Go, Swift, and exotica (COBOL, dc, sed). Students can submit in whatever language the syllabus allows without the instructor having to install runtimes.

2. **Windowed exam model** (`src/lib/assignments/management.ts:260-283`, `schema.pg.ts:340`). Each student gets a personal deadline derived from `startsAt + examDurationMinutes`. Timing changes are blocked once any session has started. The `CountdownTimer` client component (`assignments/[assignmentId]/page.tsx:182-200`) shows the student their remaining time. This is exactly the right model for accommodations and staggered cohorts.

3. **Late-penalty logic is dual-path and consistent** (`src/lib/assignments/scoring.ts`). `buildIoiLatePenaltyCaseExpr()` is the single SQL-level source of truth used by both the leaderboard query and the live-rank query. The TypeScript mirror `mapSubmissionPercentageToAssignmentPoints()` is explicitly documented as a display-only copy. There is a `lateDeadline` field (grace period end) separate from `deadline`, so a two-stage soft/hard deadline is possible.

4. **Contest analytics depth** (`contests/[assignmentId]/page.tsx:517`). The `AnalyticsCharts` component (tab "analytics") gives score distribution, solve rates, solve times, anti-cheat summary, and score progression — all within the contest detail view. The anti-cheat tab is conditional on `enableAntiCheat` and covers Jaccard-similarity pairs with escalation tiers (`src/lib/anti-cheat/review-model.ts`). CSV export with UTF-8 BOM includes anti-cheat event counts and submission IPs per participant (`src/app/api/v1/contests/[assignmentId]/export/route.ts`).

5. **Problem duplication works** (`problems/create/page.tsx:26-81`). The `?duplicateFrom=<id>` query param loads full problem data — title, description, time/memory limits, test cases, tags — into the create form. Assignment cloning also exists via `seedAssignment` prop in `assignment-form-dialog.tsx:61,105`. These two features together reduce semester-to-semester setup friction significantly.

---

## Top 10 Instructor Frustrations

### F1 — No per-language time multiplier (Severity: HIGH)
**Evidence**: `schema.pg.ts` has no `language_allowlist` column and no `time_multiplier_per_language` field on `assignments` or `assignment_problems`. The `timeLimitMs` field is per-problem only.  
**Impact**: Python runs 3-10x slower than C++ on identical algorithmic work. Setting a limit that passes Python will trivially pass C++; setting one tight for C++ will TLE Python. The instructor must either create duplicate problems or accept all-or-nothing language groupings.  
**Fix**: Add a `languageTimeMultipliers` JSONB column to `assignments` or `assignment_problems` and apply the multiplier in the judge claim/result path.

### F2 — Bulk student enrollment is missing (Severity: HIGH)
**Evidence**: `groups/[id]/page.tsx:172-185` fetches `availableStudents` and passes them to `GroupMembersManager`. The `GroupMembersManager` component (`group-members-manager.tsx`) renders a searchable dropdown — one student at a time. No CSV upload, no paste-list, no LMS sync.  
**Impact**: Enrolling 150 students takes 150 individual dropdown selections. This alone makes semester setup painful enough to try something else.  
**Fix**: Add a textarea accepting newline-separated usernames, or a CSV upload accepting `username` or `student_id` column. Backend already has the `enrollments` table; a bulk-insert API endpoint would be straightforward.

### F3 — Late penalty is one-shot flat, not tiered (Severity: MEDIUM)
**Evidence**: `schema.pg.ts:339` stores `latePenalty` as a single `double precision` value. `scoring.ts:38-39` applies `earnedPoints * (1 - penaltyFraction)` once, regardless of how many days late. There is no per-day or per-hour decay.  
**Impact**: The standard academic model is "10% off per day late." JudgeKit gives only "X% off if late" with no decay schedule.  
**Fix**: Add `latePenaltyType` (enum: `flat` | `per_day` | `per_hour`) and update `buildIoiLatePenaltyCaseExpr` to compute elapsed days/hours and multiply accordingly.

### F4 — Anti-cheat is assignment-opt-in, off by default for homework (Severity: MEDIUM)
**Evidence**: `schema.pg.ts:346` — `enable_anti_cheat` defaults to `false`. The `AntiCheatDashboard` is only rendered when `assignment.enableAntiCheat` is true (`contests/[assignmentId]/page.tsx:521`). The plagiarism check (`runAndStoreSimilarityCheck`) is never invoked automatically for non-contest homework assignments.  
**Impact**: Weekly homework, where academic dishonesty risk is highest, has no similarity checking unless the instructor manually enables it per assignment and then manually clicks "Run Similarity Check" in the contest tab (which does not even exist on the homework assignment detail page — only the contest detail page has the anti-cheat tab).  
**Fix**: Enable `enableAntiCheat` by default for homework assignments, and surface an anti-cheat tab on the homework assignment detail page (`groups/[id]/assignments/[assignmentId]/page.tsx`), not only on the contest page.

### F5 — Assignment-level CSV export is minimal (Severity: MEDIUM)
**Evidence**: `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:61-63` outputs only six columns: Student Name, Username, Class, Status, Score, Submitted At. There is no per-problem breakdown, no late penalty applied column, no override-vs-automated flag.  
**Impact**: The gradebook export cannot be directly imported into a university LMS grade column. An instructor needs to post-process manually.  
**Fix**: Add per-problem score columns (matching the contest export format) and an `isOverridden` flag to the assignment CSV. No schema change needed — the data is available from `getAssignmentStatusRows`.

### F6 — Bulk rejudge is admin-only and capped at 50 (Severity: MEDIUM)
**Evidence**: `src/app/api/v1/admin/submissions/rejudge/route.ts:12-13` — `submissions.rejudge` capability required; capped at 50 IDs per call. No UI-level "rejudge all for this assignment" button exists. Per-submission rejudge is available to instructors from the submission detail page, but there is no batch path in the group/assignment dashboard.  
**Impact**: If a judge configuration changes during an exam (e.g., time limit raised), the instructor cannot re-evaluate all submissions without admin privileges.  
**Fix**: Add an assignment-scoped rejudge endpoint (gated on `groups.manage` capability) that pages through submissions in batches. 50 is too low for a 150-student exam with 5 problems.

### F7 — TA role is view-only; co-instructor role is not TA-differentiated in practice (Severity: MEDIUM)
**Evidence**: `management.ts:93-113` — `canManageGroupMembersAsync` grants member-management to TAs only if the TA's role also carries `groups.manage_members`, which is not in the default TA capability set. `management.ts:82-85` — `canManageGroupResourcesAsync` grants full management only to co-instructors, not TAs. The `assistant` built-in role (prior review) has view-only access to everything.  
**Impact**: A TA who needs to grade student submissions, run similarity checks, or add problem-specific comments is blocked. They can view but not act.  
**Fix**: Give the TA group role `submissions.comment` and `anti_cheat.run_similarity` capabilities scoped to their assigned group. This is a two-line change in `defaults.ts`.

### F8 — Single judge worker is an exam-day SPOF (Severity: HIGH for exam)
**Evidence**: `probe-evidence.md` — "Workers online: 1, Parallel slots: 4." `judge-workers.md` — worker crash during exam means stale claim timeout (default 5 min) before submissions are reclaimed.  
**Impact**: During a mid-term with 150 students submitting simultaneously, one worker reboot causes a 5-minute judging blackout. Students see submissions stuck in "queued" with no visible ETA. No circuit-breaker or degraded-mode UX exists.  
**Fix**: Deploy at minimum 2 workers for exam events using `docker-compose.worker.yml` on `worker-0`. Document the runbook step in `high-stakes-operations.md`. A queue-depth display on the assignment page would also reduce student anxiety.

### F9 — Score override has no visible audit trail for instructors (Severity: MEDIUM)
**Evidence**: `score-override-dialog.tsx` submits reason text. The API records a reason field in `score_overrides`. But the assignment status board (`status-board.tsx`) shows only an "override indicator" badge; there is no history dialog showing who overrode, when, and why.  
**Impact**: A student disputes a grade. The instructor cannot quickly show them the override history from within the UI; they would need to query the DB or parse audit logs.  
**Fix**: Add a "View override history" expandable section in the score override dialog, fetching from the existing `score_overrides` table.

### F10 — No LMS integration (Severity: HIGH for institutional adoption)
**Evidence**: No LTI endpoint exists anywhere in `src/app/api/`. No OAuth2 consumer config in `schema.pg.ts`. `docs/api.md` documents a REST API but no LMS-specific endpoints.  
**Impact**: At most Korean universities and at US/EU schools using Canvas or Moodle, grade passback is a hard requirement. Without LTI 1.3, the instructor must manually copy grade columns every week. This is the single biggest institutional adoption blocker.  
**Fix**: LTI 1.3 Advantage is non-trivial (weeks of work). As a stopgap, document the assignment CSV export as the intended grade-passback mechanism and ensure its output format matches Canvas gradebook import requirements.

---

## Course-Lifecycle Walkthrough

### 1. Course Setup
Create group via `dashboard/groups` (create-group-dialog), set name and description. Instructor immediately assigned as owner. Add co-instructors/TAs via `GroupInstructorsManager` — this works cleanly in the UI. Student enrollment is one-at-a-time from a dropdown of active students (`groups/[id]/page.tsx:172-185`). For 150 students this is the first pain point. No CSV import, no invite link, no LMS sync. Students must already have JudgeKit accounts; there is no self-signup link to hand to a class (production has `signup` returning 404).

### 2. Problem Authoring
Navigate to `dashboard/problems/create`. The form has a Markdown + live-preview editor (Monaco), test-case management with single-case and ZIP batch upload, per-case visibility toggle, time/memory limits, comparison mode (exact or float with tolerances), difficulty rating, default language, and an AI assistant toggle (auto-disabled in exam/contest platform modes per `platform-mode.ts:13-15`). Problem duplication via `?duplicateFrom=<id>` is functional. **Missing**: a per-language time limit, any language allowlist at the problem level, and a rich-text toolbar for non-Markdown users.

### 3. Weekly Homework Assignments
Create via the `AssignmentFormDialog` modal on the group page. Fields cover title, description, start/deadline/late-deadline, late penalty (flat %), exam mode (none/scheduled/windowed), scoring model (IOI/ICPC), anti-cheat toggle, results visibility, and a problem list with per-problem points. The modal is scrollable but cramped for large problem lists. After submission deadline, export grades via the group assignment export route (name, username, class, status, total score, submitted_at — no per-problem breakdown). Anti-cheat is off by default and the anti-cheat tab only appears on contest detail pages, not homework pages.

### 4. Mid-Term Exam
Use `examMode: windowed` with `examDurationMinutes`. Each student clicking "Start Exam" creates an `exam_session` with `personalDeadline = now + examDurationMinutes`. The instructor sees all sessions on the status board with `examSessionInProgress`/`examSessionCompleted` per student. Score override is available per student. Anti-cheat must be manually enabled; even then the anti-cheat tab is on the contest detail page, not the group assignment page. No accommodation workflow for extended time beyond setting a longer global duration and hoping students start at different times.

### 5. End-of-Term Contest
Create at `dashboard/contests/create`. Two paths: "Quick Create" (minimal form via `QuickCreateContestForm`) or "Create from Group" (link to the group's assignment form). The contest detail page is the strongest instructor view: tabbed layout (Overview, Submissions, Leaderboard, Analytics, Anti-Cheat, Candidates, Invitations), live quick-stats auto-refreshing every 15s, leaderboard freeze at a configurable timestamp, animated replay, CSV/JSON export with anti-cheat event counts and IP addresses, announcements and clarifications channels, and recruiting mode with token-based invitations.

---

## Plagiarism and Academic Integrity Assessment

**What exists**: n-gram Jaccard similarity (`src/lib/assignments/code-similarity.ts`). Pipeline: `normalizeSource()` strips comments, whitespace, string literals, and preserves C preprocessor directives. `normalizeIdentifiersForSimilarity()` replaces user-defined identifiers with sequential placeholders (`v1`, `v2`, …) while preserving ~70 language keywords. `generateNgrams()` creates 3-grams. `jaccardSimilarity()` computes intersection/union. Default threshold is 0.85 (configurable per call). Rust sidecar (`code-similarity-rs/`) is tried first for performance; TypeScript fallback handles up to `MAX_SUBMISSIONS_FOR_SIMILARITY = 500` submission rows.

**Anti-cheat event tiers** (`src/lib/anti-cheat/review-model.ts`): `context` (heartbeat), `signal` (blur, contextmenu, copy, paste, tab_switch), `escalate` (ip_change, code_similarity). The three-tier model maps well to instructor workflow: review context events only if escalate events fire.

**What is missing**:
- No AI-generated code detection. The plugin registry (`src/lib/plugins/registry.ts`) contains only `chat-widget`. No OpenAI/Anthropic API call in the anti-cheat pipeline. In 2026, with students using LLMs routinely, this is a meaningful gap.
- Anti-cheat is enabled per-assignment, but only surfaced in the contest tab. Homework submissions have no reachable similarity dashboard even when `enableAntiCheat` is true on the assignment.
- The similarity check is still on-demand (manual trigger). No scheduled post-deadline automatic run.
- No plagiarism report export (flagged pairs only show in-UI; no PDF or structured CSV).
- False-positive handling is entirely manual. The instructor sees a Jaccard score but has no "mark as false positive" action to suppress a pair from future reports.
- Cross-assignment similarity (e.g., checking if Week 3 homework was copied from Week 1 of the previous semester) is not supported.

**Interpreting Jaccard scores**: 0.85 is a reasonable default for identical-structure code with variable renaming stripped. However, instructors unfamiliar with n-gram similarity may need documentation on what 0.7 vs 0.9 means in practice. The `AntiCheatDashboard` component shows raw numbers without a calibration guide.

---

## Analytics and Gradebook

### What exists
- **Contest analytics** (`components/contest/analytics-charts.tsx`): score distribution, problem solve rates, solve times, score progression, anti-cheat summary. These are real and useful.
- **Group analytics** (`dashboard/groups/[id]/analytics/page.tsx`): member count, assignment count, total submissions, average overall score (mean of per-assignment means — a rough metric), and a per-assignment table with avg/min/max scores and submission counts. The page exists and is reachable.
- **Assignment status board** (`status-board.tsx`): per-student per-problem best scores, attempt counts, last submission time, exam session status. Statistical summary row (mean, median, submitted count, perfect-score count).

### What is missing
- No longitudinal student view. There is no page showing Student A's scores across all assignments in the course over the semester.
- No per-problem accept-rate chart for homework problems. This is the most common "which topic is the class struggling with?" diagnostic.
- No grade distribution histogram for homework assignments. Only contest analytics has this.
- No cross-assignment or cross-cohort comparison.
- Group analytics uses `avg(assignments.avgScore)` — a mean of means, not a true weighted average. For assignments with different point values this gives misleading numbers.
- Charts in `AnalyticsCharts` are custom SVG without interactive tooltips beyond basic `<title>` elements (prior review confirmed; not changed in this cycle).

### Gradebook export
- Assignment CSV: name, username, class, status, total score, submitted_at. Sufficient for passing a single grade column to an LMS manually.
- Contest CSV/JSON: rank, name, username, class, total score, penalty (ICPC), per-problem score and attempts, anti-cheat event count, IP addresses. Comprehensive for contest records.
- **No aggregate export** across all assignments in a group (semester gradebook). The instructor must download one CSV per assignment and merge them manually in Excel.

---

## Compared to DOMjudge / PrairieLearn / Vjudge / Gradescope

| Feature | JudgeKit | DOMjudge | PrairieLearn | Vjudge | Gradescope |
|---|---|---|---|---|---|
| Language support | 125 variants, E2E tested | ~20 common | Python/R/MATLAB focus | 60+ via external OJs | Upload-only |
| Windowed exam (personal timer) | Yes | No | Yes | No | No |
| Anti-cheat / similarity | Jaccard n-gram, in-product | No | No | No | MOSS integration |
| Contest leaderboard freeze + replay | Yes | Yes | No | No | No |
| ICPC + IOI scoring | Yes | ICPC only | No (rubric-based) | Both | N/A |
| Per-language time multiplier | **No** | Yes (DOMjudge 8+) | N/A | N/A | N/A |
| LTI 1.3 / LMS integration | **No** | No | Yes (Canvas) | No | Yes (Canvas/Moodle) |
| Bulk student enrollment | **No** | LDAP/CSV | CSV + NetID | No | CSV / LMS roster |
| Rubric / partial credit grading | **No** | No | Yes | No | Yes |
| AI-generated code detection | **No** | No | No | No | No (3rd party) |
| Gradebook aggregate export | **No** | Yes (CSV) | Yes | No | Yes |
| Self-hosted / open-source | Yes (proprietary) | Yes (GPL) | Yes (AGPL) | No | No |

JudgeKit's clearest differentiators are the language breadth, the windowed exam model, and the integrated anti-cheat — features that DOMjudge and PrairieLearn do not match simultaneously. Its weakest areas relative to those systems are the missing LTI integration and the absence of per-language time multipliers.

---

## Adoption Blockers vs Adoption-Ready Items

### Hard blockers for a real course

1. **No bulk enrollment** — onboarding 150 students is operationally impossible without this.
2. **No LTI / LMS grade passback** — weekly grade imports are manual every time.
3. **No per-language time multiplier** — mixed-language assignments require duplicate problems or an unfair policy.
4. **Single judge worker in production** — not acceptable for a high-stakes mid-term.
5. **Anti-cheat not surfaced on homework pages** — the feature exists but is inaccessible for the primary use case (weekly homework).

### Significant friction (not hard blockers, but painful)

6. Flat late penalty only (no per-day decay).
7. Assignment CSV export is six columns with no per-problem breakdown.
8. Bulk rejudge requires admin privilege and is capped at 50.
9. No aggregate semester gradebook export.
10. TA role too restrictive to be useful.

### Adoption-ready for course use today

- **Contest management** is the most complete feature. For a 3-hour end-of-term programming contest with ICPC or IOI scoring, leaderboard freeze, analytics, and CSV export, JudgeKit is competitive with DOMjudge and better than most alternatives on anti-cheat depth.
- **Problem authoring** is solid: Markdown+live-preview, ZIP test-case import, visibility toggles, problem duplication, and 125 language images.
- **Windowed exam mode** for the mid-term is genuinely well-designed. The personal-deadline model with per-session countdown and instructor status board is something competitors lack.
- **Security posture** is good: CSP with per-request nonces, frame-ancestors none, HSTS, audit log, per-route capability checks.
- **Korean/English bilingual** support works end-to-end: i18n strings, locale-keyed homepage content, and problem statements can be written in either language.

### Honest bottom line

I would **not** run a full 150-student course on this today. The enrollment friction alone would make the first week a support nightmare. I would, however, run the **end-of-term contest** on it today, and I would pilot the **mid-term exam** if I could get a second judge worker deployed before exam day. If the team ships bulk enrollment and per-language time multipliers in the next cycle, the weekly homework workflow becomes viable, and I would reconsider for a full course.

The codebase quality is higher than typical academic OJ projects — the scoring logic is well-abstracted, the capability system is clean, and there is an actual audit trail. The gaps are feature-completeness, not architectural. That makes the adoption timeline feel like one semester of hardening away, not a rewrite.
