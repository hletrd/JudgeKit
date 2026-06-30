# Cycle 1 Multi-Agent Review Aggregate

**Date:** 2026-06-30

## Agent Participation

- **admin-reviewer**: 30 findings
- **applicant-reviewer**: 31 findings
- **architect**: 13 findings
- **assistant-reviewer**: 23 findings
- **code-reviewer**: 2 findings
- **debugger**: 3 findings
- **designer**: 19 findings
- **document-specialist**: 10 findings
- **instructor-reviewer**: 35 findings
- **perf-reviewer**: 16 findings
- **qa-tester**: 16 findings
- **security-analyzer**: 7 findings
- **security-reviewer**: 10 findings
- **student-reviewer**: 8 findings
- **test-engineer**: 16 findings
- **tracer**: 13 findings
- **verifier**: 2 findings

## Summary

This aggregate merges 252 unique findings from 17 reviewers. Critical and High issues concentrate on deployment safety (nginx/env-profile/migration fragility), judge/auth trust boundaries (open IP allowlist, AUTH_TRUST_HOST, command validation), and instructor/TA workflow gaps (announcements, similarity, extensions, exports). Medium and Low items are dominated by test coverage holes, documentation drift, performance hotspots, accessibility polish, and administrative operability gaps. No confirmed remotely exploitable RCE or auth bypass was reported, but several configuration defaults and latent race conditions require manual validation before the next production deploy.

## Cross-Agent Themes

- **nginx HTTP/2 & static-site hardening** — flagged by: code-reviewer, security-reviewer, tracer, verifier
- **deploy env-profile permissions / `.env.deploy*` hardening** — flagged by: admin-reviewer, code-reviewer, tracer
- **deploy migration / schema repair fragility** — flagged by: admin-reviewer, architect, tracer
- **judge IP allowlist & worker trust boundary** — flagged by: security-analyzer, security-reviewer
- **shell-command validation / Rust runner safety** — flagged by: security-analyzer, security-reviewer
- **AUTH_TRUST_HOST / auth URL trust** — flagged by: security-reviewer
- **contest join auth & access-code brute-force** — flagged by: instructor-reviewer, security-reviewer
- **similarity-check guards / anti-cheat** — flagged by: assistant-reviewer, instructor-reviewer, security-analyzer
- **TA/instructor role capability matrix** — flagged by: assistant-reviewer, document-specialist, instructor-reviewer
- **process-local caches / settings staleness** — flagged by: architect, perf-reviewer, tracer
- **SSE / realtime locking & polling** — flagged by: perf-reviewer, tracer
- **leaderboard / homepage performance** — flagged by: perf-reviewer, tracer
- **test quality & coverage gaps** — flagged by: qa-tester, test-engineer
- **E2E fixture cleanup & flaky tests** — flagged by: qa-tester
- **accessibility / UI affordances** — flagged by: designer, student-reviewer
- **language/docs source-of-truth drift** — flagged by: document-specialist, instructor-reviewer
- **admin restore/import info disclosure** — flagged by: admin-reviewer, security-reviewer
- **Docker compose network segmentation / sandbox hardening** — flagged by: security-analyzer, security-reviewer
- **recruiting / applicant experience** — flagged by: applicant-reviewer, student-reviewer

## Findings

### CRITICAL: All critical alerts dead-end in systemd journal — no human notification path.

- **Flagged by:** admin-reviewer
- **Location(s):** `scripts/monitor-health.sh:16`, `scripts/notify-failure@.service:6-8`
- **Details:** `scripts/monitor-health.sh:16`: ```bash log() {   echo "..." | systemd-cat -t judgekit-monitor -p "$3" } ``` CRITICAL and WARNING events go here and only here. `scripts/notify-failure@.service:6-8`: ``` ExecStart=/bin/sh -c 'echo "Service %i failed …" | systemd-cat -t service-failure -p crit'

### CRITICAL: Bulk rejudge leaks `activeTasks` permanently for in-flight workers

- **Flagged by:** tracer
- **Location(s):** `src/app/api/v1/admin/submissions/rejudge/route.ts:53-66`
- **Details:** **Severity: CRITICAL** **Confidence: HIGH**  **Location:** `src/app/api/v1/admin/submissions/rejudge/route.ts:53-66`  **Causal chain:**  1. Worker W claims submission S → `judgeWorkers.activeTasks` incremented atomically in claim CTE. 2. Admin fires bulk rejudge containing S while S has status `judging`. 3. Bulk rejudge transaction (line 53-66) sets `judgeWorkerId: null, judgeClaimToken: null` and resets status to `pending` — but **never decrements `activeTasks` on worker W**. 4. Worker W's s...

### CRITICAL: Inline SQL patches bypass both schema and migration journal

- **Flagged by:** architect
- **Location(s):** `deploy-docker.sh:1261-1262`, `src/lib/db/migrate.ts:1-7`, `scripts/check-migration-drift.sh:1-28`
- **Details:** **File:** `deploy-docker.sh:1261-1262`   **Also:** `src/lib/db/migrate.ts:1-7`, `scripts/check-migration-drift.sh:1-28`  **Observation:**   The deploy script applies two schema mutations via raw `psql` after `drizzle-kit push` completes:  ```bash ALTER TABLE problems ADD COLUMN IF NOT EXISTS default_language text; ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS default_language text; ```  These columns exist in `src/lib/db/schema.pg.ts` (as `defaultLanguage`) and are therefore handled by...

### CRITICAL: No off-host backup — 3-2-1 rule violated.

- **Flagged by:** admin-reviewer
- **Location(s):** `deploy-docker.sh:1013-1020`
- **Details:** `scripts/backup-db.sh` and `deploy-docker.sh:1013-1020` both write backups to `~/backups/` on the same host. A disk failure, host loss, or accidental `rm -rf ~/backups` destroys the database and every backup simultaneously. There is no rclone/S3/NAS copy anywhere in the backup path. - Fix: add at the end of `backup-db.sh`:   ```bash   if command -v rclone >/dev/null 2>&1 && [[ -n "${BACKUP_REMOTE:-}" ]]; then     rclone copy "$BACKUP_PATH" "${BACKUP_REMOTE}/$(hostname)/"   fi   ```   Document...

### CRITICAL: Smoke profile omits all critical submission, judging, and creation flows

- **Flagged by:** qa-tester
- **Location(s):** `playwright.config.ts:26–47`
- **Details:** **Severity:** High | **Confidence:** CONFIRMED  **File:** `playwright.config.ts:26–47` (`remoteSafeSpecsWithAuth` array)   **Failure scenario:** A deploy to `algo.xylolabs.com` triggers the smoke profile. The smoke suite runs only 12 specs covering locale, auth, public pages, health, rankings, and admin workers/languages. The following critical flows are NOT included in the smoke: - Problem creation and editing (`problem-management.spec.ts`) - Student submission and judge verdict (`student-su...

### CRITICAL: `sandbox-gate.ts`: Critical security gate has zero unit tests

- **Flagged by:** test-engineer
- **Location(s):** `src/lib/security/sandbox-gate.ts:37-84`, `src/app/api/v1/compiler/run/route.ts:77`, `src/app/api/v1/playground/run/route.ts:54`, `sandbox-gate.ts:17-21`, `sandbox-gate.ts:44-49`
- **Details:** **File:** `src/lib/security/sandbox-gate.ts:37-84` **Confidence:** CONFIRMED  `gateSandboxEndpoint()` is the sole gate protecting Docker-spawning endpoints (compiler run at `src/app/api/v1/compiler/run/route.ts:77` and playground run at `src/app/api/v1/playground/run/route.ts:54`). It enforces email verification and per-user daily quota. Every test that exercises those routes mocks it away entirely:  ```typescript // tests/unit/api/playground-run.route.test.ts vi.mock("@/lib/security/sandbox-...

### HIGH: Additive schema repairs in `deploy-docker.sh` bypass Drizzle schema tracking

- **Flagged by:** tracer
- **Location(s):** `deploy-docker.sh:1251-1263`
- **Details:** **Severity: HIGH** **Confidence: HIGH**  **Location:** `deploy-docker.sh:1251-1263` (additive repair block)  **Causal chain:**  1. Deploy script applies DDL directly via `psql` (e.g., `ALTER TABLE … ADD COLUMN IF NOT EXISTS default_language …`) before `drizzle-kit push`. 2. `drizzle-kit push` computes a diff between `schema.pg.ts` and the live DB schema. 3. Because the `psql` repair already added the column, `drizzle-kit push` sees no diff for that column and produces no migration statement f...

### HIGH: Announcements are contest-only. `src/app/api/v1/contests/[assignmentId]/announcements/route.ts:16`: `canAccessContestAnnouncements` returns `hasAccess: false` when `assignment.examMode === "none"`. A regular timed homework assignment has zero announcement infrastructure. If I discover a typo in a test case or a clarification question during a live homework period, I cannot broadcast a correction in-system.

- **Flagged by:** instructor-reviewer
- **Location(s):** `src/app/api/v1/contests/[assignmentId]/announcements/route.ts:16–32`
- **Details:** - **File:** `src/app/api/v1/contests/[assignmentId]/announcements/route.ts:16–32` - **Failure scenario:** I realize problem 2 has an ambiguous constraint 45 minutes into a 3-hour homework window. I have no in-platform way to notify students. Some students notice the Slack update; others miss it and solve the wrong version. - **Suggested fix:** Remove the `examMode === "none"` guard from the announcements API. Group-member enrollment check is sufficient — announcements should be available for ...

### HIGH: Anti-cheat privacy notice dialog appears after the timer starts.

- **Flagged by:** applicant-reviewer
- **Location(s):** `src/components/exam/anti-cheat-monitor.tsx:42-48`, `src/components/exam/anti-cheat-monitor.tsx:373-412`
- **Details:** 1. I click "Start Assessment" → `signIn("credentials", {recruitToken})` → redirects to `/contests/${assignmentId}`. 2. Exam page mounts, timer is live, `personalDeadline` clock is ticking. 3. `AntiCheatMonitor` initializes: `showPrivacyNotice = sessionStorage.getItem(...) !== "accepted"` → true on first visit. 4. A blocking modal appears: "Tab-switch events, copy/paste actions, IP-address changes, and periodic code snapshots" (lines 386-392). 5. I lose 20-60 seconds reading and processing thi...

### HIGH: Browser crash or accidental close loses in-progress code.

- **Flagged by:** applicant-reviewer
- **Details:** *Concrete failure:* Candidate is 45 minutes into a hard problem, their laptop battery dies. They restart and return to the contest page. The editor is blank. Their last snapshot may be from 2 minutes before the crash. Candidate cannot recover mental state quickly under time pressure.   *Fix:* Persist editor draft to `localStorage[assignmentId:problemId:draft]` on every keystroke (debounced). Restore on mount. Show "Draft restored" toast.

### HIGH: CSV export lacks per-problem breakdown. `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:61`:

- **Flagged by:** instructor-reviewer
- **Location(s):** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:61–76`
- **Details:** ```ts const header = ["Student Name", "Username", "Class", "Status", "Score", "Submitted At"] ``` The export contains only the total score. There are no per-problem columns, no override indicator, no adjusted-vs-raw late-penalty split. My university LMS (Canvas) expects one column per scored item for item analysis and grade passback. I must manually re-enter per-problem scores for 120 students. - **File:** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:61–76` - **Failu...

### HIGH: Container logs unbounded — disk fill confirmed risk.

- **Flagged by:** admin-reviewer
- **Details:** `docker-compose.production.yml`: no `logging:` section on any service (grep confirms zero occurrences of `logging:`, `max-size`, `max-file`). All services use docker's default json-file driver with unlimited accumulation. Services with `RUST_LOG: info` (`:165`, `:183`) plus verbose Next.js output accumulate without bound. algo was at 67% disk as of 5/21. - Fix: add to every service in `docker-compose.production.yml`:   ```yaml   logging:     driver: json-file     options:       max-size: "50m...

### HIGH: Deadline display timezone mismatch risk. `formatDateTimeInput` in `assignment-form-dialog.tsx:73–82` converts stored UTC timestamps to the browser's local timezone offset (`date.getTimezoneOffset()`). The system displays deadlines to students in the server's system timezone (read from `getResolvedSystemTimeZone()`). An instructor working from a different timezone than the server will see a different local time in the form than what students see on the deadline.

- **Flagged by:** instructor-reviewer
- **Location(s):** `src/app/(public)/groups/[id]/assignment-form-dialog.tsx:73–82`
- **Details:** - **File:** `src/app/(public)/groups/[id]/assignment-form-dialog.tsx:73–82` - **Failure scenario:** Instructor is in GMT+9 (Korea), server timezone is UTC. Instructor sets "deadline 11:59 PM" — the form shows and stores 23:59 KST = 14:59 UTC. Students see "deadline 14:59 UTC" (2:59 PM), not 11:59 PM. Late submissions in the evening are judged as on-time from the student's perspective but the instructor considers them late. - **Suggested fix:** Display the system timezone next to each datetime...

### HIGH: E2E `contest-participant-audit.spec.ts`: All assertion paths use `test.skip(true, ...)` — permanently dead

- **Flagged by:** test-engineer
- **Location(s):** `tests/e2e/contest-participant-audit.spec.ts:52,65,79,111,123,136,177,190,203`, `contest-full-lifecycle.spec.ts:65+`
- **Details:** **File:** `tests/e2e/contest-participant-audit.spec.ts:52,65,79,111,123,136,177,190,203` **Confidence:** CONFIRMED  Every assertion branch in this spec ends in `test.skip(true, "...")`. These are unconditional — `test.skip(true)` always skips regardless of what precedes it:  ```typescript if (!isVisible) {   test.skip(true, "No contests available to test");   return; } ```  After `test.skip(true)` the test body is abandoned. The spec emits 0 failures but exercises 0 assertions about participa...

### HIGH: HIGH | OOM-killed container misclassified as `TimeLimit` when `duration_ms > time_limit`

- **Flagged by:** debugger
- **Location(s):** `judge-worker-rs/src/executor.rs:142–155`
- **Details:** **File:** `judge-worker-rs/src/executor.rs:142–155`  **Root cause:** `classify_test_case_verdict` evaluates `exceeded_problem_limit` **before** `oom_killed`. The `exceeded_problem_limit` branch (line 148) fires when `duration_ms > effective_time_limit_ms`, regardless of whether the kill was caused by OOM.  ```rust fn classify_test_case_verdict(inputs: VerdictInputs) -> Verdict {     let exceeded_problem_limit = inputs.duration_ms > inputs.effective_time_limit_ms;     if inputs.timed_out && ex...

### HIGH: Hamburger toggle 32px — fails WCAG 2.5.5 minimum touch target

- **Flagged by:** designer
- **Location(s):** `src/components/layout/public-header.tsx:259`
- **Details:** **File:** `src/components/layout/public-header.tsx:259` **Failure scenario:** On a mobile device a user taps the hamburger to open navigation. The button is `size-8` = 32×32px, below the WCAG 2.5.5 / iOS HIG / Material 44×44px minimum. The ThemeToggle and LocaleSwitcher siblings both correctly use `size-11` on mobile — making this inconsistency visible side-by-side. ```tsx // Current — FAILS (32px) className="inline-flex size-8 items-center justify-center rounded-md …" ``` **Fix:** ```tsx cla...

### HIGH: Leaderboard staleness check uses `Date.now()` but cache-write timestamps use `getDbNowMs()` — clock skew causes permanent stale loop

- **Flagged by:** tracer
- **Location(s):** `src/lib/assignments/contest-scoring.ts:139-189`
- **Details:** **Severity: HIGH** **Confidence: HIGH**  **Location:** `src/lib/assignments/contest-scoring.ts:139-189`  **Causal chain:**  1. Cache entry is written at line 189: `createdAt: await getDbNowMs()` — this is the **DB server clock**. 2. Staleness check at line 145: `const nowMs = Date.now()` — this is the **app server clock**. 3. The difference `age = nowMs - entry.createdAt` is the difference between two clocks on two machines. 4. If the DB clock leads the app server clock by `D` milliseconds:  ...

### HIGH: Monitoring starts during privacy notice (gap in heartbeat).

- **Flagged by:** applicant-reviewer
- **Location(s):** `anti-cheat-monitor.tsx:237-239`, `anti-cheat-monitor.tsx:244-246`
- **Details:** *Files:* `anti-cheat-monitor.tsx:237-239`, `anti-cheat-monitor.tsx:244-246`   *Concrete failure:* Candidate reads privacy notice carefully (60 s), accepts, begins coding. Recruiter anti-cheat timeline shows 60 s absence at exam start. "Candidate appeared to be on another device at the start." Platform fault, not candidate fault.   *Fix:* Either log a synthetic `heartbeat` on privacy notice acceptance, or move consent pre-start so monitors start immediately.

### HIGH: No "test your editor" before start.

- **Flagged by:** applicant-reviewer
- **Details:** *Concrete failure scenario:* Candidate's corporate proxy blocks CDN for Monaco editor assets. Editor shows blank area. Candidate loses 5-10 minutes troubleshooting. Timer doesn't pause.

### HIGH: No TA workload metrics anywhere.

- **Flagged by:** assistant-reviewer
- **Details:** - No surface shows: submissions in my groups awaiting first comment, comments I've posted this week, median time-to-first-comment, students per TA split. - Admin metrics (`src/lib/ops/admin-metrics.ts`) expose queue depth to admins only. - Scenario: Instructor asks in the TA meeting "what's your grading load this week?" No answer available from the platform. - Fix: Add `/api/v1/ta/workload` endpoint: count of submissions in assigned groups with zero comments, count of comments posted by the c...

### HIGH: No automated restore drill.

- **Flagged by:** admin-reviewer
- **Location(s):** `verify-db-backup.sh:13-27`, `postgres:18-alpine`
- **Details:** `verify-db-backup.sh:13-27`: the default path (no `RESTORE_DATABASE_URL`) checks gzip validity and counts 100 lines — it does NOT call `pg_restore`. A custom-format pg_dump with a corrupted TOC passes the gzip check. No scheduled restore drill exists. The first live restore attempt may be during an actual disaster. - Fix: monthly systemd timer (`scripts/online-judge-backup-drill.timer`) firing on the 1st at   03:30. Script: spin up `postgres:18-alpine` container; `pg_restore` into it; `SELECT...

### HIGH: No boilerplate/template exclusion. If I distribute starter code to 120 students (a common practice for scaffolded assignments), the similarity detector flags all pairs that kept the boilerplate. With n-gram size 3 and threshold 0.85, a 100-line scaffold shared by 120 students produces up to 7 140 flagged pairs, drowning out genuine cheating signals.

- **Flagged by:** instructor-reviewer
- **Location(s):** `src/lib/assignments/code-similarity.ts:259–309`
- **Details:** - **File:** `src/lib/assignments/code-similarity.ts:259–309` (no exclusion mechanism) - **Failure scenario:** I give students a linked-list skeleton for a DS assignment. Similarity check returns every student pair as >0.9 similar. I spend 4 hours triaging false positives before finding the 3 actual cheating pairs. - **Suggested fix:** Allow the instructor to upload "boilerplate" source that is subtracted from the n-gram sets before comparison; expose a textarea or file upload in the similarit...

### HIGH: No contest-mode preflight checklist or script.

- **Flagged by:** admin-reviewer
- **Details:** Before an exam or contest, there is no operator-executable preflight. Operators make manual judgement calls with no structured verification. The 5/21 review proposed `scripts/contest-preflight.sh`; it does not exist. - Fix: `scripts/contest-preflight.sh` (exits 0 = all clear, non-zero = blocked):   - `SELECT count(*) FROM judge_workers WHERE status='online'` > 0   - Worker health endpoint returns 200   - `docker exec judgekit-worker-docker-proxy printenv POST` == 1   - Pre-deploy backup age <...

### HIGH: No documented secret rotation procedure for any of the 7 key types.

- **Flagged by:** admin-reviewer
- **Details:** | Secret | Rotation impact | Downtime? | Documented? | |---|---|---|---| | `POSTGRES_PASSWORD` | DB + all app containers must be updated atomically | Seconds | No | | `AUTH_SECRET` (NextAuth) | Invalidates all active sessions | Cannot rotate mid-exam | No | | `JUDGE_AUTH_TOKEN` | Worker + app must restart atomically | Seconds | No | | `CODE_SIMILARITY_AUTH_TOKEN` | Sidecar + app must restart | Seconds | No | | `RATE_LIMITER_AUTH_TOKEN` | Sidecar + app must restart | Seconds | No | | `PLUGIN_C...

### HIGH: No explicit "you are done, you may close the tab" end screen.

- **Flagged by:** applicant-reviewer
- **Location(s):** `countdown-timer.tsx:227-233`
- **Details:** *Files:* `messages/en.json` — no "all done" ceremony key under `recruit`; `countdown-timer.tsx:227-233`   *Fix:* When `onExpired` fires on the recruit contest context, show a dedicated modal: "Your assessment time has ended. Your best submission per problem has been recorded. You may close this tab. Results will be available at [link] after the assessment closes."

### HIGH: No in-platform DM system.

- **Flagged by:** assistant-reviewer
- **Details:** - No `messages` table, no direct-message route, no messaging UI. Every student-TA conversation outside of submission comments goes to email.

### HIGH: No per-student deadline extension for non-windowed assignments. Extending a student's window only works for `examMode === "windowed"` via `PATCH /exam-sessions/[userId]` (`exam-sessions/[userId]/route.ts:53`). Regular homework (`examMode === "none"`) has no per-student extension mechanism. Instructors routinely grant extensions to students with documented accommodations or illness.

- **Flagged by:** instructor-reviewer
- **Location(s):** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-sessions/[userId]/route.ts:53`
- **Details:** - **File:** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-sessions/[userId]/route.ts:53` - **Failure scenario:** A student gets sick the day before a homework deadline. I cannot extend just their deadline. The only options are: extend the deadline for the whole class, or manually override their score after the fact (losing the auto-judging window). - **Suggested fix:** Add a `studentDeadlineOverrides` table supporting optional per-enrollment deadline extension for any `examMode`...

### HIGH: No problem statement version history. As an instructor I cannot see what a problem said before I edited it, and students in a live homework window see the new text with no change notice. If I find a typo mid-deadline and fix it, there is no audit of what changed.

- **Flagged by:** instructor-reviewer
- **Details:** - **File:** `src/app/(public)/problems/[id]/edit/page.tsx` (no version/history endpoint exists) - **Failure scenario:** I fix a confusing constraint at T+30 min into a 3-hour homework. Students who read the problem before the fix are competing on different specs. I have no record of what I changed. - **Suggested fix:** Record problem description edits with timestamp and actor in a `problem_history` table; surface a "history" tab on the problem editor. Minimum: show `updatedAt` prominently in ...

### HIGH: No regrade request model, API route, or UI.

- **Flagged by:** assistant-reviewer
- **Details:** - Checked: `src/lib/db/schema.ts` (no `regrade_requests` table), all API routes (no `/regrade` path), all page components (no intake form). - Scenario: A student emails "I think my recursive solution was correct, the judge timed out unfairly." I handle it via email threads with no platform record. An instructor asking "how many regrades did you resolve this semester and what were the outcomes?" gets no answer from the system. - Fix: Add `regrade_requests` table (`submissionId`, `requesterId`,...

### HIGH: No self-service data export for candidates or students.

- **Flagged by:** admin-reviewer
- **Details:** There is no GDPR/PIPA "right to access" endpoint. A candidate who sat a recruiting test must be served manually by an admin. Korean PIPA requires a data export response within 30 days of request. - Fix: `GET /api/v1/user/my-data` returning the requesting user's submissions, login events,   anti-cheat events, and profile data as JSON. Rate-limited (one request per 24 h), audit-logged.

### HIGH: No side-by-side code diff for similarity hits.

- **Flagged by:** assistant-reviewer
- **Details:** - The pairs table shows `(student1, student2, language, similarity%)` but there is no drill-through to aligned code. I cannot distinguish "shared boilerplate" from "copy-paste" from this view alone. - Scenario: 80% Jaccard between two students on a Python string-reversal problem. Could be the universal `[::-1]` slice. I have to manually open both submissions in separate tabs and eyeball them. - Fix: Add a detail modal that fetches both submissions' source (TAs have `submissions.view_source`) ...

### HIGH: No special judge / checker support. The system offers only `exact` and `float` comparison modes (`create-problem-form.tsx:804–843`). There is no mechanism for a custom comparator binary. I cannot grade "output any valid topological order," "find any shortest path," or "output any permutation with score ≥ K" problems.

- **Flagged by:** instructor-reviewer
- **Location(s):** `src/app/(public)/problems/create/create-problem-form.tsx:803`
- **Details:** - **File:** `src/lib/validators/problem-management.ts` (comparisonMode enum), `src/app/(public)/problems/create/create-problem-form.tsx:803` - **Failure scenario:** I assign a problem where multiple outputs are valid. Students with correct but non-canonical answers all receive WA. I spend Sunday night manually regrading 40 submissions. - **Suggested fix:** Add a `checker` problem type that accepts a checker script (Python or compiled binary) evaluated inside the judge sandbox; expose an uploa...

### HIGH: No student notification when a TA comments on a submission.

- **Flagged by:** assistant-reviewer
- **Location(s):** `src/app/api/v1/submissions/[id]/comments/route.ts:81-114`
- **Details:** - File: `src/app/api/v1/submissions/[id]/comments/route.ts:81-114` - The POST handler inserts the comment, fires an audit event, and returns. No email or in-app notification is sent. The `src/lib/email/index.ts` module handles email but is not wired here. - Scenario: I leave a comment on a compile error at 11 PM. The student submits again the next morning with the same mistake because they never saw my note. - Fix: After `db.insert(submissionComments)`, call the email/notification utility add...

### HIGH: No visible "your code is being autosaved" indicator.

- **Flagged by:** applicant-reviewer

### HIGH: No workload counter or grading triage view.

- **Flagged by:** assistant-reviewer
- **Details:** - No UI surface shows a TA "7 submissions in your groups have no feedback yet." The assistant dashboard component (`src/app/(public)/dashboard/_components/student-dashboard.tsx`) is shared with students and shows no pending-review count. There is no TA-specific dashboard component. - Scenario: End of week, instructor asks how many submissions still need review. I have to manually scroll through the status board and count. - Fix: Add a per-TA workload card on the dashboard. A `LEFT JOIN submis...

### HIGH: Per-problem score columns absent from export (see also INS-GRADE-1). LMS integrations are broken. Canvas, Blackboard, and Moodle CSV imports require one column per assignment item. The current single `Score` column requires manual pivot-table work for every class, every week.

- **Flagged by:** instructor-reviewer
- **Location(s):** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:61`
- **Details:** - **File:** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:61` - **Severity:** HIGH | **Confidence:** HIGH

### HIGH: Process-local caches have no cross-instance invalidation

- **Flagged by:** architect
- **Location(s):** `src/lib/system-settings-config.ts:84`, `src/lib/capabilities/cache.ts:17`, `src/lib/assignments/contest-analytics-cache.ts:27`
- **Details:** **Files:**   - `src/lib/system-settings-config.ts:84` — settings cache (15s TTL)   - `src/lib/capabilities/cache.ts:17` — role→capabilities cache (60s TTL)   - `src/lib/assignments/contest-analytics-cache.ts:27` — LRU analytics cache (60s TTL, no explicit invalidation API)  **Observation:**   All three caches are module-level in-process singletons. Invalidation functions (`invalidateSettingsCache()`, `invalidateRoleCache()`) zero a process-local timestamp or clear a process-local Map. In a ho...

### HIGH: Results sign-in is confusing without a known username.

- **Flagged by:** applicant-reviewer
- **Location(s):** `results/page.tsx:104-117`, `recruiting-invitations.ts:725`
- **Details:** *File:* `results/page.tsx:104-117`, `recruiting-invitations.ts:725`   *Concrete failure:* Candidate returns 3 days later to see their score. They navigate to `/recruit/{token}/results`. It says "sign in." They go to the normal login page, don't know their username, try their email → fails if email wasn't set. They're locked out of their own results with no recovery path shown.   *Fix:* On the "Sign in required" card, tell the candidate explicitly: "Go back to the assessment start page and ent...

### HIGH: Session `maxAge` is captured once at NextAuth module initialization

- **Flagged by:** architect
- **Location(s):** `src/lib/auth/config.ts:325`
- **Details:** **File:** `src/lib/auth/config.ts:325`  ```typescript session: { strategy: "jwt", maxAge: getSessionMaxAgeSeconds() }, ```  **Observation:**   `getSessionMaxAgeSeconds()` is called *once* when the NextAuth configuration object is evaluated during module load (Node.js module system caches the result). The function reads from the `systemSettings` cache (itself reading from DB on first miss). After the module is loaded, subsequent admin changes to `sessionMaxAgeSeconds` in the settings table hav...

### HIGH: Similarity check is contest-only (confirmed code bug). `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:18`:

- **Flagged by:** instructor-reviewer
- **Location(s):** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:18`
- **Details:** ```ts if (!assignment || assignment.examMode === "none") {   return apiError("notFound", 404); } ``` Regular homework assignments (`examMode === "none"`) get a 404 when similarity is triggered. The UI anti-cheat dashboard becomes a dead end for the course workflow where cheating is most common: take-home assignments. - **File:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:18` - **Failure scenario:** I suspect two students of sharing code on a take-home homework. I click ...

### HIGH: Similarity check is hardcoded contest-only and returns 404 for regular homework. `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:18`:

- **Flagged by:** instructor-reviewer
- **Details:** ```ts if (!assignment || assignment.examMode === "none") {   return apiError("notFound", 404); } ``` Homework assignments (`examMode === "none"`) get a 404 when similarity is triggered. Homework is where I see the most copying. - **Failure scenario:** I run similarity check on a homework assignment. The UI returns a 404. I have no way to detect copying on 3-week take-home assignments. - **Suggested fix:** Remove the `examMode === "none"` guard. Similarity check is equally valid for assignment...

### HIGH: Similarity results are ephemeral client-side state only.

- **Flagged by:** assistant-reviewer
- **Location(s):** `src/components/contest/anti-cheat-dashboard.tsx:103`
- **Details:** - File: `src/components/contest/anti-cheat-dashboard.tsx:103` - Code: `const [similarityPairs, setSimilarityPairs] = useState<SimilarityPairView[]>([])` - Scenario: I run similarity, see 6 flagged pairs, open a student's timeline in a new tab. Return to the dashboard — pairs are gone. Re-run: 30-second blocking operation. During a live exam this adds load at peak time. - Fix: Persist similarity results server-side. The `code_similarity` event type already writes individual pair flags to `anti...

### HIGH: TAs cannot grant time extensions during a live exam.

- **Flagged by:** assistant-reviewer
- **Location(s):** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-sessions/[userId]/route.ts:39-45`, `src/lib/assignments/management.ts:73-87`, `status-board.tsx:219`
- **Details:** - File: `src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-sessions/[userId]/route.ts:39-45` - Code: `const canManage = await canManageGroupResourcesAsync(group.instructorId, user.id, user.role, id); if (!canManage) return forbidden();` - `canManageGroupResourcesAsync` at `src/lib/assignments/management.ts:73-87` returns true for group owner, `co_instructor` role, or `groups.view_all` capability — NOT for group TAs (`role = 'ta'` in `group_instructors`). - Consequence: `canManageOver...

### HIGH: TAs cannot post contest announcements or respond to clarifications.

- **Flagged by:** assistant-reviewer
- **Location(s):** `src/app/api/v1/contests/[assignmentId]/announcements/route.ts:19`, `clarifications/route.ts:19`
- **Details:** - Files: `src/app/api/v1/contests/[assignmentId]/announcements/route.ts:19`, `clarifications/route.ts:19` - Both use `canManageContest` which resolves to `canManageGroupResourcesAsync` — excludes group TAs. - Scenario: At minute 30, problem C has a typo in the sample. The instructor is unreachable. I cannot post a correction. Students stall. - Fix: Either use `canMonitorContest` for announcement/clarification write (TAs already pass it) or add a dedicated `canCommunicateOnContest` helper that...

### HIGH: TAs cannot write contest clarification responses.

- **Flagged by:** assistant-reviewer
- **Location(s):** `src/app/api/v1/contests/[assignmentId]/clarifications/route.ts:19`
- **Details:** - File: `src/app/api/v1/contests/[assignmentId]/clarifications/route.ts:19` - `canManageContest` excludes group TAs. The `ContestClarifications` component at the contest manage page receives `canManage={canManage}` where `canManage = canManageGroupResourcesAsync(...)` — false for TAs. TAs see the read-only list but cannot respond. - Scenario: During a live exam, a student asks "Can we use built-in sort?" I know the answer. I cannot reply without reaching the instructor (same root as Finding 3...

### HIGH: Zero announcement capability for non-exam assignments. `src/app/api/v1/contests/[assignmentId]/announcements/route.ts:16–32` gates the entire announcement system on `assignment.examMode !== "none"`. A regular homework assignment (the most common type in a course) has no errata broadcast mechanism. This is the single highest-friction gap for course instructors.

- **Flagged by:** instructor-reviewer
- **Location(s):** `src/app/api/v1/contests/[assignmentId]/announcements/route.ts:16`
- **Details:** - **File:** `src/app/api/v1/contests/[assignmentId]/announcements/route.ts:16` - **Failure scenario:** A student posts in the course Slack that problem 3 input format is ambiguous. I fix the problem statement. The other 119 students who didn't check Slack still have the old interpretation. Some get WA on what would be a correct solution for the clarified version. - **Suggested fix:** Remove `examMode === "none"` guard; make announcements available for all assignments. It is a simple enrollmen...

### HIGH: `/api/v1/judge/poll` route path is permanently frozen by Rust worker binary

- **Flagged by:** architect
- **Location(s):** `src/app/api/v1/judge/poll/route.ts:1-5`
- **Details:** **File:** `src/app/api/v1/judge/poll/route.ts:1-5`  ``` // The path /api/v1/judge/poll is baked into the deployed worker binary, // so renaming the directory would break production without a coordinated redeploy. ```  **Observation:**   The route name "poll" is semantically wrong — the endpoint *receives* POST results from workers, it does not serve poll responses. The comment documents that this misnaming is permanent because renaming requires rebuilding and redeploying the Rust binary on `w...

### HIGH: `audit_events` pruned at 90 days with no cold storage.

- **Flagged by:** admin-reviewer
- **Location(s):** `src/lib/data-retention.ts:1-7`
- **Details:** `src/lib/data-retention.ts:1-7` defaults: `auditEvents: 90` days. After pruning, the record is permanently gone. Academic integrity disputes or labour disputes filed > 90 days after an event have no log trail. - Fix: before the prune cron removes `audit_events` older than the threshold, write them to a   compressed NDJSON file: `audit-archive/audit-YYYYMM.ndjson.gz` on the host. Push to off-host   storage (same destination as database backups). Or raise the default to 365 days and document   ...

### HIGH: `derive-key.ts`: HKDF key derivation has zero unit tests

- **Flagged by:** test-engineer
- **Location(s):** `src/lib/security/derive-key.ts:1-36`
- **Details:** **File:** `src/lib/security/derive-key.ts:1-36` **Confidence:** CONFIRMED  `deriveEncryptionKey(domain)` and `legacyEncryptionKey()` are never imported by any test file. The HKDF approach uses domain separation so each plugin-config domain gets a cryptographically independent key. None of these properties are verified:  - Two different `domain` strings must produce different 32-byte keys. - The same `domain` string must be deterministic (same input → same key). - `legacyEncryptionKey()` must ...

### HIGH: `flix` Docker image documented as `judge-jvm`; actual image is `judge-flix`

- **Flagged by:** document-specialist
- **Details:** **Files:** - `AGENTS.md` line 113: `| 88 | flix | Flix (JVM) | judge-jvm |` - `docs/languages.md` line 73: `| 67 | flix | Flix (JVM) | judge-jvm | ✅ | ✅ | ✅ | ✅ |` - `src/lib/judge/languages.ts` line 1197: `dockerImage: "judge-flix:latest"` - `docker/Dockerfile.judge-flix` line 1: `FROM judge-jvm:latest` (extends jvm; distinct image)  **Failure scenario:** A developer or agent consulting either AGENTS.md or docs/languages.md to understand which Docker image backs `flix` submissions believes t...

### HIGH: `hcaptcha.ts`: `verifyHcaptchaToken` and configuration helpers have zero unit tests

- **Flagged by:** test-engineer
- **Location(s):** `src/lib/security/hcaptcha.ts:1-83`, `src/lib/security/hcaptcha.ts:63-68`
- **Details:** **File:** `src/lib/security/hcaptcha.ts:1-83` **Confidence:** CONFIRMED  `isHcaptchaConfigured`, `getHcaptchaSecret`, `getHcaptchaSiteKey`, and `verifyHcaptchaToken` are all mocked at every call site and never executed in tests. Grep across all test directories confirms no file imports these from the actual module.  Untested behaviors:  - **DB vs. env precedence**: `getHcaptchaSiteKey()` returns `db.siteKey || envSiteKey()`. If the DB setting is an empty string, it falls back to env because `...

### HIGH: `j` and `malbolge` appear in README Docker image size table but have no language config anywhere

- **Flagged by:** document-specialist
- **Details:** **Files:** - `README.md` lines 87 (`judge-malbolge`, 114 MB / 136 MB arm64) and 93 (`judge-j`, 150 MB / 507 MB arm64) - `src/types/index.ts`: neither `j` nor `malbolge` present in `Language` union - `src/lib/judge/languages.ts`: no entries for `j` or `malbolge` - `AGENTS.md` language table: neither listed - `docs/languages.md` table: neither listed - `docker/Dockerfile.judge-j`, `docker/Dockerfile.judge-malbolge`: both exist and are functional Dockerfiles  **Failure scenario:** A user or agen...

### HIGH: `judgekit-app-data` and `judgekit-dead-letter` volumes not backed up.

- **Flagged by:** admin-reviewer
- **Location(s):** `docker-compose.production.yml:195-201`
- **Details:** `docker-compose.production.yml:195-201` declares `judgekit-app-data` (mounted at `/app/data`) and `judgekit-dead-letter` (at `/app/dead-letter`). Neither appears in `backup-db.sh` or the pre-deploy backup step. Dead-letter entries for failed judgments are silently pruned at 1000 items (per `executor.rs`) with no prior export. - Fix: add volume backup to the daily timer:   ```bash   docker run --rm \     -v judgekit-dead-letter:/dlq \     -v /home/${USER}/backups:/backups \     alpine tar czf ...

### HIGH: `production-config.ts`: `assertProductionConfig` process.exit(1) path never tested

- **Flagged by:** test-engineer
- **Location(s):** `src/lib/security/production-config.ts:61-93`
- **Details:** **File:** `src/lib/security/production-config.ts:61-93` **Confidence:** CONFIRMED  `assertProductionConfig()` is called from `src/instrumentation.ts` at Next.js boot. When `NODE_ENV=production` and any of `CRON_SECRET`, `CODE_SIMILARITY_AUTH_TOKEN`, `RATE_LIMITER_AUTH_TOKEN`, or `NODE_ENCRYPTION_KEY` is missing, it calls `process.exit(1)`. No test exercises this module at all:  ```bash grep -r "production-config\|assertProductionConfig" tests/

### HIGH: `roc` in AGENTS.md language table (row 94) but absent from the `Language` type union

- **Flagged by:** document-specialist
- **Details:** **Files:** - `AGENTS.md` line 119: `| 94 | roc | Roc alpha4 | judge-roc |` - `src/types/index.ts`: `roc` is **not** present in the `Language` union (confirmed exhaustive read of lines 31–165) - `docs/languages.md` "Disabled Languages" section: correctly lists `roc` as disabled (upstream compiler panic)  **Failure scenario:** AGENTS.md's "Adding a New Language" checklist (step 1) directs agents to `src/types/index.ts` as the first step. An agent scanning AGENTS.md to audit which languages are ...

### HIGH: `sensitive-settings.ts`: `SENSITIVE_SETTINGS_KEYS` list completeness never behavior-tested

- **Flagged by:** test-engineer
- **Location(s):** `src/lib/security/sensitive-settings.ts:18-48`
- **Details:** **File:** `src/lib/security/sensitive-settings.ts:18-48` **Confidence:** CONFIRMED  `touchesSensitiveSettingsKey()` and `requireSettingsReconfirm()` are mocked in every caller test. The actual key list in `SENSITIVE_SETTINGS_KEYS` is the canonical security boundary — if any key that affects security posture is omitted from the list, password reconfirmation is silently skipped.  ```typescript // tests/unit/actions/system-settings.test.ts — only usage vi.mock("@/lib/security/sensitive-settings"...

### HIGH: `stop_grace_period` not set in `docker-compose.production.yml`.

- **Flagged by:** admin-reviewer
- **Details:** `judge-worker-rs/src/main.rs` implements graceful drain but `docker-compose.production.yml` has no `stop_grace_period:` on `judge-worker`. Docker's default is 10 seconds before SIGKILL. A Java or Scala compilation that takes 12 seconds is killed mid-run; the submission stays `judging` indefinitely. - Fix: add `stop_grace_period: 120s` to the `judge-worker` service. - Failure scenario: rolling deploy issues `docker stop judgekit-judge-worker`; 10 s later SIGKILL   arrives mid Java compilation;...

### HIGH: `submissions.judgeWorkerId` lacks a foreign key constraint

- **Flagged by:** architect
- **Location(s):** `src/lib/db/schema.pg.ts:487, 507`
- **Details:** **File:** `src/lib/db/schema.pg.ts:487, 507`  ```typescript judgeWorkerId: text("judge_worker_id"),           // line 487 — no .references() // ... index("submissions_judge_worker_idx").on(table.judgeWorkerId), // line 507 ```  **Observation:**   The column is plain `text` with no `references(() => judgeWorkers.id)`. When a worker is decommissioned and deleted from `judgeWorkers`, all its historical submissions retain the old `judgeWorkerId` string with no DB-level integrity protection. No ca...

### HIGH: src/app/(public)/dashboard/_components/student-dashboard.tsx:100–102

- **Flagged by:** student-reviewer
- **Suggested fix:** change the filter to `(assignment.lateDeadline ?? assignment.deadline) && (assignment.lateDeadline ?? assignment.deadline)! > now`, and add a "Late" badge when only `lateDeadline` is still open.

### HIGH: src/app/(public)/practice/problems/[id]/page.tsx:636

- **Flagged by:** student-reviewer
- **Suggested fix:** thread `isSubmissionBlocked` into `PublicQuickSubmit`/`ProblemSubmissionForm` as a prop. When `true`, replace the submit button with a disabled state and a "Deadline has passed" message.

### HIGH: src/hooks/use-unsaved-changes-guard.ts:5

- **Flagged by:** student-reviewer
- **Location(s):** `src/components/problem/problem-submission-form.tsx:103`
- **Suggested fix:** add a `warningMessage` i18n key in the `problems` namespace and pass it: `useUnsavedChangesGuard({ isDirty, warningMessage: t("unsavedChangesWarning") })`.

### MEDIUM: AGENTS.md describes Docker build/delete API auth as "Admin/super_admin only"; code gates on `system.settings` capability

- **Flagged by:** document-specialist
- **Details:** **Files:** - `AGENTS.md` lines 261–262:   - `POST /api/v1/admin/docker/images/build` — "Admin/super_admin only. Audit logged."   - `DELETE /api/v1/admin/docker/images` — "Admin/super_admin only. Audit logged." - `src/app/api/v1/admin/docker/images/build/route.ts` line 19: `auth: { capabilities: ["system.settings"] }` - `src/app/api/v1/admin/docker/images/route.ts` line 93 (POST) and line 165 (DELETE): `auth: { capabilities: ["system.settings"] }` - `docs/api.md` (correct): "Requires `system.s...

### MEDIUM: ANALYZE failure silently swallowed and reported as success.

- **Flagged by:** admin-reviewer
- **Location(s):** `deploy-docker.sh:1276`
- **Details:** `deploy-docker.sh:1276`: ```bash psql -h db -U judgekit -d judgekit -c 'ANALYZE;' 2>&1 || true success "Database statistics updated" ``` `|| true` means a timed-out or permission-failed ANALYZE prints a green success line and the deploy continues. The planner operates on stale statistics until the next successful ANALYZE. Under exam-day concurrent load this can produce 10–30× query plan regressions. - Fix: `|| { warn "ANALYZE failed — query planner statistics may be stale"; }`. Remove the   u...

### MEDIUM: Analytics cache stale check uses `Date.now()` vs DB-clock `createdAt`

- **Flagged by:** architect
- **Location(s):** `src/lib/assignments/contest-analytics-cache.ts:47, 62`
- **Details:** **File:** `src/lib/assignments/contest-analytics-cache.ts:47, 62`  ```typescript // line 47 (cache write): analyticsCache.set(cacheKey, { data: analytics, createdAt: await getDbNowMs() });  // line 62 (stale check): const age = nowMs - cached.createdAt;  // nowMs = Date.now() ```  **Observation:**   Cache entries are timestamped with `getDbNowMs()` (DB server clock). The freshness check computes `age = Date.now() - cached.createdAt` using the Node.js process wall clock (`Date.now()`). If the ...

### MEDIUM: Backup encryption opt-in, plaintext default.

- **Flagged by:** admin-reviewer
- **Location(s):** `backup-db.sh:90-91`
- **Details:** `backup-db.sh:90-91`: AGE encryption only activates when `AGE_RECIPIENT` is non-empty. On all three production targets, this must be manually configured; `.env.production.example` does not mention it. Backups stored in `~/backups/` are unencrypted pg_dump files readable by anyone with host filesystem access. - Fix: document `AGE_RECIPIENT` in `.env.production.example` as a recommended field. Add a   deploy-time `warn` (not `die`) when `AGE_RECIPIENT` is unset.  ---

### MEDIUM: Backups are unencrypted by default.

- **Flagged by:** admin-reviewer
- **Location(s):** `backup-db.sh:90`
- **Details:** `backup-db.sh:90`: `AGE_RECIPIENT` defaults to empty. On all three production hosts, daily pg_dump files in `~/backups/` are plaintext. Anyone with read access to the host filesystem can read the full database. - Fix: document `AGE_RECIPIENT` in `.env.production.example`. Emit a deploy-time `warn` when   unset.  ---

### MEDIUM: Claim CTE deadlock risk documented but unmitigated at the architecture level

- **Flagged by:** architect
- **Location(s):** `src/lib/judge/claim-query.ts:97-99`
- **Details:** **File:** `src/lib/judge/claim-query.ts:97-99`  ``` // Two workers simultaneously reclaiming each other's stale rows can trigger // Postgres transaction abort. Self-recovering via retry. ```  **Observation:**   The 5-CTE claim query uses `FOR UPDATE SKIP LOCKED` to achieve race-free claim. However, the documented scenario at lines 97-99 — two workers concurrently reclaiming each other's previously-stale rows — creates a deadlock that Postgres resolves by aborting one transaction. The abort ca...

### MEDIUM: Clarifications are contest-only (same namespace as announcements). Students cannot submit clarification requests on regular homework assignments.

- **Flagged by:** instructor-reviewer
- **Details:** - **Severity:** MEDIUM | **Confidence:** HIGH

### MEDIUM: Compile-phase DoS ceiling (10 min × 2 GiB)

- **Flagged by:** security-analyzer

### MEDIUM: Confirm dialog mentions "the timer" but not the exact duration in all cases.

- **Flagged by:** applicant-reviewer

### MEDIUM: Dead-letter volume contains student code with no retention policy.

- **Flagged by:** admin-reviewer
- **Details:** `judgekit-dead-letter` holds submission source files for failed judgments. These are PII in the university context (student code). The volume is not backed up (D3) and is silently pruned at 1000 items. There is no documented retention policy. - Fix: document retention in the privacy page. Include dead-letter data in the self-service   export (P1) and in the GDPR deletion workflow.

### MEDIUM: Deploy profile files are sourced before local permission hardening

- **Flagged by:** code-reviewer
- **Location(s):** `deploy-docker.sh:141-158`, `AGENTS.md:427`
- **Details:** - Severity: Medium - Confidence: High - Evidence: `deploy-docker.sh:141-158` sources `.env.deploy` and `.env.deploy.<target>` directly; `AGENTS.md:427` says all `.env*` including `.env.deploy*` are expected to be `0600`. - Problem: target profiles often carry SSH keys, passwords, runner URLs, or other deploy secrets. If a profile is created under a permissive umask, the script consumes it without correcting or warning. - Failure scenario: an operator adds `SSH_PASSWORD` or a private key path/...

### MEDIUM: Heartbeat gap at privacy notice acceptance will appear suspicious.

- **Flagged by:** applicant-reviewer

### MEDIUM: Judge IP allowlist allow-all default

- **Flagged by:** security-analyzer

### MEDIUM: Late penalty not broken out in export or UI. The adjusted score is stored and displayed correctly, but neither the status board nor the CSV export shows the raw pre-penalty score alongside the adjusted score. A student disputing a late penalty cannot verify the calculation from the grade report.

- **Flagged by:** instructor-reviewer
- **Details:** - **Severity:** MEDIUM | **Confidence:** HIGH  ---

### MEDIUM: MEDIUM | Backup retention loop never prunes encrypted backups

- **Flagged by:** debugger
- **Location(s):** `scripts/backup-db.sh:100–106`
- **Details:** **File:** `scripts/backup-db.sh:100–106`  **Root cause:** The outer `find` at line 100 iterates all four backup patterns (`.db`, `.db.age`, `.sql.gz`, `.sql.gz.age`). But `NEWER_COUNT` at line 102 only counts `.db` and `.sql.gz`:  ```bash

### MEDIUM: MEDIUM — Server-level `client_max_body_size 50M` contradicts "scoped to report endpoint" comment and test name

- **Flagged by:** verifier
- **Location(s):** `deploy-docker.sh:1476`, `deploy-docker.sh:1548`, `tests/unit/infra/judge-report-nginx.test.ts:23`
- **Details:** **File:** `deploy-docker.sh:1476` (TLS block) and `deploy-docker.sh:1548` (HTTP block)   **Introduced:** pre-cycle-3 (body size structure predates the cycle-3 commit; the HTTP/2 fix landed on top of it)   **Confidence:** HIGH — confirmed by direct code read and cross-reference with `scripts/online-judge.nginx.conf`  **Description:**   The generated nginx config written by `deploy-docker.sh` places `client_max_body_size 50M;` at the **server block level** (lines 1476 and 1548), before any loca...

### MEDIUM: No "final submission accepted" ceremony with timestamp.

- **Flagged by:** applicant-reviewer

### MEDIUM: No "rejudge this assignment" action from the gradebook. After fixing a buggy test case I must navigate to Admin → Submissions, apply group + assignment filters, and trigger bulk rejudge. The assignment status board has no rejudge button.

- **Flagged by:** instructor-reviewer
- **Details:** - **Suggested fix:** Add a "Rejudge All" button on the assignment status board visible only to instructors; call the existing bulk rejudge route with this assignment's filter pre-applied. - **Severity:** MEDIUM | **Confidence:** HIGH

### MEDIUM: No "reviewed / cleared" flag for similarity hits. The anti-cheat dashboard shows flagged pairs but provides no way to mark a pair as "reviewed — not a violation." Re-running the check resets all events. Unreviewed and cleared pairs look identical.

- **Flagged by:** instructor-reviewer
- **Details:** - **Suggested fix:** Add a `reviewedAt` / `reviewOutcome` field to `antiCheatEvents`; surface a dropdown (pending / cleared / escalated) on each pair row. - **Severity:** MEDIUM | **Confidence:** HIGH

### MEDIUM: No clarifications for non-exam assignments. The clarification endpoint is in the `contests` namespace and gated identically (`src/app/api/v1/contests/[assignmentId]/clarifications/route.ts`). Students cannot ask formalized questions for homework assignments.

- **Flagged by:** instructor-reviewer
- **Details:** - **Severity:** MEDIUM | **Confidence:** HIGH

### MEDIUM: No cross-assignment serial-cheater pattern detection.

- **Flagged by:** assistant-reviewer
- **Details:** - The similarity check (`runAndStoreSimilarityCheck`) operates per-assignment only. There is no UI or API to chain a student's code across multiple assignments.

### MEDIUM: No editorial model, route, or UI.

- **Flagged by:** assistant-reviewer
- **Details:** - Checked: `src/lib/db/schema.ts` (problem record has `title`, `description`, `statement`, test cases, function spec — no `editorial` or `solutionCode` field). - Scenario: I authored problem C for the semester contest. After the deadline I want to publish my editorial with annotated code. My only option is posting to the course forum with no platform-level link to the problem and no release-timing control.  ---

### MEDIUM: No evidence export for academic integrity hearings. I cannot download a PDF or formatted report of the similarity finding for submission to the academic integrity office.

- **Flagged by:** instructor-reviewer
- **Details:** - **Suggested fix:** Add a "Export evidence PDF/CSV" action from the anti-cheat dashboard that packages the pair comparison, code diff, timestamps, and submission metadata. - **Severity:** MEDIUM | **Confidence:** HIGH

### MEDIUM: No explicit "what happens if time expires while my submission is in transit" message.

- **Flagged by:** applicant-reviewer

### MEDIUM: No explicit "you may use language stdlib docs" statement.

- **Flagged by:** applicant-reviewer
- **Details:** ---

### MEDIUM: No explicit usage-policy for external resources.

- **Flagged by:** applicant-reviewer
- **Location(s):** `messages/en.json:2867-2871`, `src/app/(auth)/recruit/[token]/page.tsx:300-309`
- **Details:** *File:* `messages/en.json:2867-2871`, `src/app/(auth)/recruit/[token]/page.tsx:300-309`   *Fix:* Add a bullet under "Before you start": "You may reference language documentation in another tab. Brief tab-switches are expected and noted, not disqualifying on their own."

### MEDIUM: No global or group-level banner announcements. An admin-level notice (e.g., "Judge queue degraded — submissions may be delayed") cannot be displayed as a banner. Instructors cannot post group-level announcements outside of an active assignment context.

- **Flagged by:** instructor-reviewer
- **Details:** - **Severity:** MEDIUM | **Confidence:** HIGH

### MEDIUM: No import from Codeforces/BOJ/Polygon. The `/api/v1/problems/import` route (`src/app/api/v1/problems/import/route.ts:8`) only accepts the JudgeKit JSON schema (`problemImportSchema`). There is no URL-based import or adapter for Polygon packages or BOJ problem packs.

- **Flagged by:** instructor-reviewer
- **Details:** - **Failure scenario:** I want to reuse a problem from a prior Codeforces round for a practice assignment. I must manually re-type the statement, recreate test cases, and set limits — wasting an hour. - **Suggested fix:** Add a `source` field to the import schema accepting a Polygon-compatible ZIP, or implement a URL-fetch adapter for known archives. - **Severity:** MEDIUM | **Confidence:** HIGH

### MEDIUM: No per-problem language restriction. The exam form supports `enableAntiCheat` but no allowed-language list per problem. I cannot enforce "problem 1: C++ only" or "exam: no Python, only C++/Java" to test language-specific skills.

- **Flagged by:** instructor-reviewer
- **Details:** - **Suggested fix:** Add `allowedLanguages: string[]` to `assignmentProblems` schema; enforce at the submission creation route by comparing language against the per-problem list. - **Severity:** MEDIUM | **Confidence:** HIGH

### MEDIUM: No per-problem per-language time limit override for instructors. Time limits are a single global `timeLimitMs` per problem; per-language adjustment is a global admin-controlled multiplier (`src/lib/db/schema.pg.ts:544 timeLimitMultiplier`). Instructors cannot set "Python 5 s / C++ 1 s" per problem without asking the admin to change a global system setting.

- **Flagged by:** instructor-reviewer
- **Details:** - **Failure scenario:** I set a 2 s limit for a graph problem. Java and Python students fail every test on time even with correct solutions. The admin's global multiplier is set to 1.0 because it suits the competitive elective. My intro course students are penalized. - **Suggested fix:** Add optional `perLanguageTimeLimitMs: Record<string, number>` to the problem schema; surface it in the form under advanced settings. - **Severity:** MEDIUM | **Confidence:** HIGH

### MEDIUM: No per-problem statistics in the analytics page. The group analytics page (`src/app/(public)/groups/[id]/analytics/page.tsx`) shows per-assignment aggregate stats (member count, submission counts) but not per-problem solve rates, time-to-first-solve histograms, or attempt-count distributions. I cannot quickly identify which problem stumped the class without manual DB queries.

- **Flagged by:** instructor-reviewer
- **Details:** - **Suggested fix:** Add a per-problem breakdown section to the analytics page: solve rate, median solve time, attempt-count histogram. - **Severity:** MEDIUM | **Confidence:** HIGH

### MEDIUM: No per-student progress view. There is no page showing a single student's assignment completion trajectory across all assignments in a group (score trend, late submissions, attempt history). If a student asks why they are failing I cannot show them a progress dashboard.

- **Flagged by:** instructor-reviewer
- **Details:** - **Severity:** MEDIUM | **Confidence:** HIGH

### MEDIUM: No post-assessment feedback form.

- **Flagged by:** applicant-reviewer

### MEDIUM: No push or email notification when TA posts submission comment.

- **Flagged by:** assistant-reviewer
- **Details:** - Same root as Finding 2-B. Once I leave feedback, there is no mechanism to alert the student to check it.  ---

### MEDIUM: No rollback procedure documented or scripted.

- **Flagged by:** admin-reviewer
- **Details:** `:latest` is the only image tag. After a broken deploy is detected, recovery requires `git revert` + full rebuild — 15–30 minutes of downtime during an exam. - Fix: tag current `:latest` as `:previous` before each build. Add `scripts/rollback-deploy.sh`   that retags `:previous` → `:latest`, runs `docker compose up -d`, and runs the smoke check.

### MEDIUM: No submission attempt limit per student. Students can submit unlimited times; in a 120-student course this degrades queue performance during the deadline rush and rewards trial-and-error over understanding.

- **Flagged by:** instructor-reviewer
- **Details:** - **Suggested fix:** Add optional `maxAttemptsPerStudent` to the assignment schema; enforce at the submission creation route. - **Severity:** MEDIUM | **Confidence:** HIGH

### MEDIUM: No test case generator support. I cannot define a generator script + validator. Large hidden test suites must be uploaded manually or via ZIP.

- **Flagged by:** instructor-reviewer
- **Details:** - **Severity:** MEDIUM | **Confidence:** HIGH

### MEDIUM: No verdict distribution metric — compile_error sweep still invisible after deploy.

- **Flagged by:** admin-reviewer
- **Details:** Neither `/api/metrics` nor `src/lib/ops/admin-health.ts` exposes `judgekit_verdict_total{verdict="…"}`. The health probe detects docker-proxy misconfig at startup but not a mid-run proxy ACL change, sidecar crash, or other partial failure that causes only some submissions to fail. - Fix: add `judgekit_verdict_total{verdict="accepted|wrong_answer|compile_error|…"}` counter to   `src/lib/ops/admin-metrics.ts`. Add a 5-minute windowed `compile_error_ratio` check to   `admin-health.ts`. Return de...

### MEDIUM: No webhook when audit write fails.

- **Flagged by:** admin-reviewer
- **Details:** `src/lib/audit/events.ts` exposes `judgekit_audit_failed_writes` gauge. No alert path fires when `failed_writes > 0`. Operator discovers silently failed auditing only by watching Prometheus — if a scraper is even configured. - Fix: surface `judgekit_audit_failed_writes > 0` as a degraded signal in   `src/lib/ops/admin-health.ts` and in the monitor webhook (see O1 below).

### MEDIUM: Override audit trail not visible in gradebook UI. The audit log records who overrode a score and when (`overrides/route.ts:130–146`), but the status board only shows an italic score and a pencil icon. I cannot see "Overridden by TA Kim on 2026-06-28 14:30" without navigating to the admin audit log.

- **Flagged by:** instructor-reviewer
- **Location(s):** `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx:246–279`
- **Details:** - **File:** `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx:246–279` - **Failure scenario:** A student disputes their grade. I open the status board and see an italic score. I cannot tell which TA changed it, when, or why without exporting the audit log and filtering manually. - **Suggested fix:** Surface the `createdBy` name and `createdAt` from the overrides table in a tooltip on the pencil icon. - **Severity:** MEDIUM | **Confidence:** HIGH

### MEDIUM: Privacy Policy link opens in a new tab without explanation.

- **Flagged by:** applicant-reviewer

### MEDIUM: Recruiter-visible "best score" vs. candidate-visible "best score" may diverge.

- **Flagged by:** applicant-reviewer

### MEDIUM: Rust sidecars have no `/metrics` endpoint.

- **Flagged by:** admin-reviewer
- **Details:** `code-similarity-rs` and `rate-limiter-rs` expose `/health` only. No Prometheus metrics (request count, auth failures, latency percentiles). These are on every submission's hot path. A broken rate-limiter that silently drops requests produces no observable signal except downstream 500s. - Fix: add `axum-prometheus` to both crates. Expose `/metrics` with at minimum:   `rate_limiter_check_total{outcome="allow|deny"}`, `rate_limiter_check_duration_seconds`,   `rate_limiter_auth_fail_total`.

### MEDIUM: SSE shared poll timer interval is fixed at timer creation; runtime config changes are ignored for active connections

- **Flagged by:** tracer
- **Details:** **Severity: MEDIUM** **Confidence: HIGH**  **Location:** `src/app/api/v1/submissions/[id]/events/route.ts` — shared poll timer setup  **Causal chain:**  1. A shared `setInterval` is created once per process (or once per "first subscriber") with the `ssePollIntervalMs` value read at that moment. 2. If `system_settings.ssePollIntervalMs` is changed at runtime, the in-flight `setInterval` is not recreated. 3. Active SSE clients continue to receive updates at the old interval. 4. The new interval...

### MEDIUM: Score override reason field is optional — audit trail is hollow.

- **Flagged by:** assistant-reviewer
- **Location(s):** `src/app/(public)/groups/[id]/assignments/[assignmentId]/score-override-dialog.tsx:91`, `overrides/route.ts:131`, `overrides/route.ts:15`
- **Details:** - File: `src/app/(public)/groups/[id]/assignments/[assignmentId]/score-override-dialog.tsx:91` - Code: `reason: reason.trim() || undefined` - Scenario: TA overrides a score by 1 point for "missing newline" and leaves reason blank. Audit log at `overrides/route.ts:131` records `reason: null`. Six weeks later a student disputes the grade; there is no reconstructible justification. - Fix: Make `reason` required both on the frontend (add validation in `handleSave`, add `required` to the Textarea)...

### MEDIUM: Similarity Check button active for TAs but API returns 403 — silent failure with generic toast.

- **Flagged by:** assistant-reviewer
- **Location(s):** `src/components/contest/anti-cheat-dashboard.tsx:282-327`, `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:21`
- **Details:** - Files: `src/components/contest/anti-cheat-dashboard.tsx:282-327` (button always rendered); `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:21` (guards on `canManageContest`) - No disabled state, no tooltip explaining the restriction, no conditional render. Generic error toast fired (`tCommon("error")` at line 323). - This is the TA-visible face of the `anti_cheat.run_similarity` dead capability (Finding 3-D). The button should either be hidden or disabled with a tooltip wh...

### MEDIUM: Similarity Check button shown to TAs but API returns 403 — no affordance.

- **Flagged by:** assistant-reviewer
- **Location(s):** `src/components/contest/anti-cheat-dashboard.tsx:282-327`, `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:21`
- **Details:** - Files: `src/components/contest/anti-cheat-dashboard.tsx:282-327` (button always rendered inside the dashboard); `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:21` (uses `canManageContest`) - The anti-cheat tab is gated only on `assignment.enableAntiCheat` — no `canManage` check on the tab or on the dashboard component. TAs reach `AntiCheatDashboard`, the similarity button renders unconditionally. - Scenario: Post-exam I click "Run Similarity Check." Generic `tCommon("erro...

### MEDIUM: Student lookup limited to name, username, className — no student ID or email.

- **Flagged by:** assistant-reviewer
- **Location(s):** `src/lib/assignments/submissions.ts:44-53`
- **Details:** - File: `src/lib/assignments/submissions.ts:44-53` (`matchesStudentQuery`) - Code: `[row.name, row.username, row.className ?? ""].join(" ").toLocaleLowerCase().includes(normalizedQuery)` - Scenario: A student emails "hi, it's Lee, student ID 2024-1234, my submission exploded." There is no way to type "2024-1234" in the filter box. With 60 students named "Lee" in a university, this is a real lookup failure. - Fix: Add `studentId` to the user lookup in `getAssignmentStatusRows` (the `users` tab...

### MEDIUM: Tab-switch grace period is undisclosed.

- **Flagged by:** applicant-reviewer
- **Location(s):** `anti-cheat-monitor.tsx:53`, `anti-cheat-monitor.tsx:280-289`
- **Details:** *Files:* `anti-cheat-monitor.tsx:53`, `anti-cheat-monitor.tsx:280-289`   *Fix:* Disclose in the pre-start notice: "Brief tab switches (under 3 seconds) are not flagged."

### MEDIUM: Token in URL with no guidance.

- **Flagged by:** applicant-reviewer
- **Details:** *File:* `page.tsx` — no warning text   *Fix:* Add a short paragraph: "This link is unique to you. Do not share it."

### MEDIUM: WA diff not accessible from the gradebook. To see actual vs. expected output on a wrong answer I must navigate from the status board → student → problem → submission → submission detail. There is no inline diff expansion in the gradebook.

- **Flagged by:** instructor-reviewer
- **Details:** - **Severity:** MEDIUM | **Confidence:** HIGH

### MEDIUM: `.context/development/conventions.md` references a missing `ENV.md`

- **Flagged by:** document-specialist
- **Details:** **Files:** - `.context/development/conventions.md` line 22: "See `ENV.md` for credentials and deployment commands." - `ENV.md`: **does not exist** anywhere in the project root or `.context/`.  **Failure scenario:** An agent following the conventions doc to find deployment credentials looks for `ENV.md` and finds nothing. The actual credential/credential-placeholder file is `.env.example` (documented in AGENTS.md and README). An agent may stall or fall back to guessing credentials.  **Suggeste...

### MEDIUM: `JUDGE_ALLOWED_IPS` is cached at module level and never reloads without a restart

- **Flagged by:** tracer
- **Location(s):** `src/lib/judge/ip-allowlist.ts:26-49`
- **Details:** **Severity: MEDIUM** **Confidence: HIGH**  **Location:** `src/lib/judge/ip-allowlist.ts:26-49`  ```ts let cachedAllowlist: string[] | null = null;  function getAllowlist(): string[] | null {   if (cachedAllowlist !== null) return cachedAllowlist;   // reads process.env once, then caches   ...   cachedAllowlist = entries;   return cachedAllowlist; } ```  **Causal chain:**  1. `JUDGE_ALLOWED_IPS` is read from `process.env` once and stored in `cachedAllowlist`. 2. If a new judge worker is provis...

### MEDIUM: `anti_cheat.run_similarity` capability declared in assistant defaults but never enforced by the API.

- **Flagged by:** assistant-reviewer
- **Location(s):** `src/lib/capabilities/defaults.ts:29`, `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:21`
- **Details:** - Files: `src/lib/capabilities/defaults.ts:29` (ASSISTANT_CAPABILITIES includes `anti_cheat.run_similarity`), `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:21` (uses `canManageContest`, ignores capabilities entirely) - The capability shows in the role editor's capability matrix, giving admins the impression that granting it enables similarity for a role. It does nothing. - Fix: In `similarity-check/route.ts`, replace `canManageContest` with a check: `caps.has("anti_cheat.r...

### MEDIUM: `app:` does not depend_on code-similarity or rate-limiter.

- **Flagged by:** admin-reviewer
- **Location(s):** `docker-compose.production.yml:110-112`
- **Details:** `docker-compose.production.yml:110-112`: ```yaml app:   depends_on:     db:       condition: service_healthy ``` On deploy, `docker compose up -d` starts `app` once `db` is healthy, without waiting for `code-similarity` or `rate-limiter`. First requests arriving before the sidecars are healthy get 500 errors from the app. - Fix:   ```yaml   app:     depends_on:       db:         condition: service_healthy       code-similarity:         condition: service_healthy       rate-limiter:         co...

### MEDIUM: `blur` event fires with no grace period.

- **Flagged by:** applicant-reviewer

### MEDIUM: `blur` signal is noisy on Mac.

- **Flagged by:** applicant-reviewer
- **Location(s):** `anti-cheat-monitor.tsx:296-299`
- **Details:** *File:* `anti-cheat-monitor.tsx:296-299`

### MEDIUM: `deploy-docker.sh` exceeds modularization threshold at 1704 lines

- **Flagged by:** architect
- **Location(s):** `deploy-docker.sh:1-1704`
- **Details:** **File:** `deploy-docker.sh:1-1704`  **Observation:**   The script has crossed 1700 lines and mixes at least six distinct concerns: Docker build orchestration, BuildKit cache recovery, DB migration, Nginx config generation, health checking, and environment validation. A single bash failure anywhere aborts the entire deploy with no partial-state recovery. The inline SQL patches (F-1) are a direct symptom of this accumulation pattern.  **Current pain points already visible in the code:**   - Bu...

### MEDIUM: `env.deploy.<target>` profile file not hardened at creation; credentials are world-readable under default `umask 0022`

- **Flagged by:** tracer
- **Location(s):** `deploy-docker.sh:141-158`, `AGENTS.md:427`
- **Details:** **Severity: MEDIUM** **Confidence: HIGH**  **Location:** `deploy-docker.sh:141-158` (profile creation section); `AGENTS.md:427`  **Causal chain:**  1. When no `env.deploy.<target>` file exists, the script creates one from `env.deploy.example`. 2. The `cp` command inherits the shell's `umask` — typically `0022` on Linux, leaving the file `0644` (world-readable on a multi-user machine). 3. The operator then fills in real credentials (`JUDGE_AUTH_TOKEN`, `DB_PASSWORD`, etc.). 4. The credentials ...

### MEDIUM: `ip.ts`: `unwrapMappedIpv4()` not directly tested as exported function

- **Flagged by:** test-engineer
- **Location(s):** `src/lib/security/ip.ts:33-44`, `unwrapMappedIpv4("::FFFF:192.0.2.1")`, `unwrapMappedIpv4("::ffff:1.2.3.4:extra")`, `unwrapMappedIpv4("::ffff:999.1.1.1")`, `ip.test.ts:118`
- **Details:** **File:** `src/lib/security/ip.ts:33-44` **Confidence:** CONFIRMED  `unwrapMappedIpv4` is exported but only exercised indirectly via `extractClientIp`. The following edge cases have no direct test:  - `unwrapMappedIpv4("::FFFF:192.0.2.1")` — uppercase `FFFF` (regex is `/i` so it matches, but untested) - `unwrapMappedIpv4("")` — empty string (regex won't match, returns `null`, untested) - `unwrapMappedIpv4("::ffff:1.2.3.4:extra")` — trailing garbage after the IPv4 portion - `unwrapMappedIpv4("...

### MEDIUM: `judge-haskell` base image: AGENTS.md says `ghc:9.4-alpine`; Dockerfile uses `alpine:3.21`; `languages.ts` says `Debian Bookworm`

- **Flagged by:** document-specialist
- **Location(s):** `| judge-haskell | 1.81 GB | ghc:9.4-alpine | **-2.16 GB (54%)** |`, `FROM alpine:3.21`, `ghc:9.4-alpine`, `alpine:3.21`
- **Details:** **Files:** - `AGENTS.md` line 216 (Docker image size table): `| judge-haskell | 1.81 GB | ghc:9.4-alpine | **-2.16 GB (54%)** |` - `docker/Dockerfile.judge-haskell` line 1: `FROM alpine:3.21` - `src/lib/judge/languages.ts` `DOCKER_IMAGE_RUNTIME_INFO`: `"judge-haskell:latest": "Debian Bookworm / GHC 9.4"`  **Failure scenario:** All three sources disagree. The AGENTS.md size table references the old `ghc:9.4-alpine` pre-optimization base. The Dockerfile correctly uses `alpine:3.21`. But `langua...

### MEDIUM: `judge-worker-rs/src/runner.rs`: No Rust unit tests for HTTP handler validation logic

- **Flagged by:** test-engineer
- **Details:** **File:** `judge-worker-rs/src/runner.rs` **Confidence:** CONFIRMED  `runner.rs` (~350 lines) contains the judge-worker's HTTP API including source-code size enforcement (`MAX_SOURCE_CODE_BYTES = 64*1024`), stdin size enforcement (`MAX_STDIN_BYTES = 64*1024`), Docker image validation on incoming `docker_image` fields, semaphore capacity enforcement, and the `docker_capability_ok` AtomicBool gate. There are zero `#[cfg(test)]` blocks in this file.  The `validation.rs` module is well-tested; bu...

### MEDIUM: `minPasswordLength` system setting is dead code — not enforced

- **Flagged by:** architect
- **Location(s):** `src/lib/db/schema.pg.ts:591`
- **Details:** **File:** `src/lib/db/schema.pg.ts:591`  ```typescript minPasswordLength: integer("min_password_length"), ```  **Observation:**   `minPasswordLength` exists in the `systemSettings` table and is (presumably) configurable via the admin UI. However, `grep` across all `src/` files finds zero references to `minPasswordLength` or `min_password_length` in any validator, middleware, or registration handler. Password validation in user-facing routes does not consult this setting.  **Failure scenario:*...

### MEDIUM: `proxy.test.ts`: 18 live `Date.now()` calls without fake timers — potential clock flake

- **Flagged by:** test-engineer
- **Location(s):** `tests/unit/proxy.test.ts:113,336,347,358,386,397,408,451,464,477`, `vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))`
- **Details:** **File:** `tests/unit/proxy.test.ts:113,336,347,358,386,397,408,451,464,477` **Confidence:** CONFIRMED  The proxy test creates token fixtures with `authenticatedAt: Math.trunc(Date.now() / 1000)` to represent a "just logged in" session. The middleware compares this against a mocked `tokenInvalidatedAt` to decide if the session is revoked. Tests run under real wall-clock time with no `vi.useFakeTimers()`.  If a test machine's `Date.now()` ticks across a second boundary between fixture creation...

### MEDIUM: `rate-limit-core.ts`: ON CONFLICT first-insert race path not directly tested

- **Flagged by:** test-engineer
- **Location(s):** `src/lib/security/rate-limit-core.ts:75-121`, `tests/unit/security/api-rate-limit.test.ts:458`, `rate-limit-core.ts:98`
- **Details:** **File:** `src/lib/security/rate-limit-core.ts:75-121` **Confidence:** CONFIRMED  `insertRateLimitEntryIfAbsent()` returns `true` when it wins the insert race, `false` when a concurrent transaction already inserted. On `false`, callers fall through to UPDATE. This is the AGG2-3 fix — without it, concurrent first-hits throw a unique-violation 500.  Tests in `tests/unit/security/api-rate-limit.test.ts:458` cover "first-insert race" conceptually, but the DB mock always returns as if the insert s...

### MEDIUM: `rate-limiter-rs/src/main.rs`: `constant_time_eq`, bearer middleware, and backoff cap untested

- **Flagged by:** test-engineer
- **Location(s):** `rate-limiter-rs/src/main.rs:51-57,62-89,196-213`
- **Details:** **File:** `rate-limiter-rs/src/main.rs:51-57,62-89,196-213` **Confidence:** CONFIRMED  The rate-limiter Rust sidecar has only two integration-style tests: `check_increments_and_blocks_at_limit` and `record_failure_blocks_and_reset_clears_entry`. Missing coverage:  1. **`constant_time_eq` (lines 51–57)**: The constant-time comparison used for bearer auth is never directly tested. Equal-length different-content inputs returning `false` is unverified.  2. **`require_bearer` middleware (lines 62–...

### MEDIUM: `revokeContestAccessTokensForGroup()`: Only asserted via source-scan, not behavior-tested

- **Flagged by:** test-engineer
- **Location(s):** `src/lib/assignments/contest-access-tokens.ts:60-82`
- **Details:** **File:** `src/lib/assignments/contest-access-tokens.ts:60-82` **Confidence:** CONFIRMED  The group-member-delete test verifies the function is *called* by scanning the route's source file:  ```typescript // tests/unit/api/group-member-delete-implementation.test.ts:28 expect(source).toContain("revokeContestAccessTokensForGroup(tx, id, userId)"); ```  This verifies the function name appears in the source — not that it executes, uses the correct arguments, runs inside the transaction, or return...

### MEDIUM: `session.maxAge` evaluated once at module load; runtime changes have no effect

- **Flagged by:** tracer
- **Details:** **Severity: MEDIUM** **Confidence: HIGH**  **Location:** `src/lib/auth/config.ts` — `session.maxAge` field  **Causal chain:**  1. NextAuth config object is constructed at module initialization time. 2. `session.maxAge` is set from a call to `getConfiguredSettings()` (or a constant) at that moment. 3. If an admin changes `system_settings.sessionMaxAgeSec` at runtime, the in-process NextAuth config is not updated. 4. New sessions issued after the change still use the old `maxAge` until the serv...

### MEDIUM: `tags.updatedAt` is nullable — no `.notNull()` unlike all other tables

- **Flagged by:** architect
- **Location(s):** `src/lib/db/schema.pg.ts:1161-1162`
- **Details:** **File:** `src/lib/db/schema.pg.ts:1161-1162`  ```typescript // tags table (line 1161): updatedAt: timestamp("updated_at", { withTimezone: true })   .$defaultFn(() => new Date()),    // no .notNull()  // All other tables (e.g., line 963-964): updatedAt: timestamp("updated_at", { withTimezone: true })   .notNull()   .$defaultFn(() => new Date()), ```  **Observation:**   Every other table with `updatedAt` (checked at lines 963, 989, 1025, 1083, 1137) has `.notNull()`. The `tags` table is the so...

### MEDIUM: assistant/TA API scope not independently verified.

- **Flagged by:** admin-reviewer
- **Location(s):** `src/lib/capabilities/defaults.ts:20`
- **Details:** `src/lib/capabilities/defaults.ts:20` notes assistant is "restricted to assigned teaching groups." No verification in this review that every high-privilege admin route (`migrate/export/`, `users/`, `submissions/export/`) actually enforces group scope for assistant callers. Deferred as C2-F11 but the blast radius of mistaken assistant promotion includes data export. - Fix: add integration tests asserting assistant-role sessions receive 403 on   `GET /api/v1/admin/users` and `GET /api/v1/admin/...

### MEDIUM: docker-socket-proxy full-create + no userns

- **Flagged by:** security-analyzer

### MEDIUM: docs/api.md `GET /api/v1/admin/docker/images` says "Admin or Super Admin"; code uses `system.settings` capability

- **Flagged by:** document-specialist
- **Details:** **Files:** - `docs/api.md` line 1668: "List Docker images. **Admin or Super Admin.**" - `src/app/api/v1/admin/docker/images/route.ts` line 56: `auth: { capabilities: ["system.settings"] }`  **Failure scenario:** Same class as Finding 4 — any role granted `system.settings` (custom roles are supported per `docs/api.md` Admin Roles section) can list Docker images, but docs/api.md implies only built-in admin/super_admin can. Developers writing permission documentation or integration tests would a...

### MEDIUM: src/app/(public)/practice/page.tsx:459

- **Flagged by:** student-reviewer
- **Suggested fix:** add a fourth `"untried"` option to `PROGRESS_FILTER_VALUES` mapping to `progress === "untried"`, and relabel the current "unsolved" to "Not Solved" so it's clear it spans both attempted and untried.

### MEDIUM: src/components/code/code-editor.tsx:139

- **Flagged by:** student-reviewer
- **Suggested fix:** either add a `keydown` listener mapping `F` → `toggleFullscreen` when focus is outside the editor content, or remove the `<span>F</span>` label entirely.

### LOW: "May be recorded" ambiguity.

- **Flagged by:** applicant-reviewer
- **Details:** ---

### LOW: AGENTS.md language table row count (126 entries) does not match claimed "125 language variants"

- **Flagged by:** document-specialist
- **Details:** **Files:** - `AGENTS.md` line 20: "JudgeKit currently defines 125 language variants." - `AGENTS.md` language table: rows 1–6, 6b, 7–8, 8b, 9–124 = **126 rows** (6b and 8b are additional entries for cpp26 and clang_cpp26) - Row 94 (`roc`) is one of those rows but `roc` is not an active language (see Finding 2) - Actual active languages: 125 (confirmed from `src/types/index.ts`)  **Failure scenario:** Low-impact — AGENTS.md itself acknowledges this table can drift ("Treat `src/lib/judge/languag...

### LOW: Admin password transmitted in JSON body on deprecated migrate/import path

- **Flagged by:** security-reviewer
- **Location(s):** `src/app/api/v1/admin/migrate/import/route.ts:145-160`
- **Details:** **Severity:** MEDIUM   **Category:** A02 Cryptographic Failures   **Location:** `src/app/api/v1/admin/migrate/import/route.ts:145-160`   **Exploitability:** Requires middleware/reverse-proxy access-logging to be enabled; admin-level credential   **Blast Radius:** Admin password captured in access logs if body logging is enabled anywhere in the proxy/middleware chain  **Issue:**   The deprecated JSON body path accepts `{ password, data }` where the admin password is embedded in the request bod...

### LOW: Admin skeleton content shape doesn't communicate table structure

- **Flagged by:** designer
- **Details:** **Files:** `src/app/(dashboard)/dashboard/admin/loading.tsx` (and `users/`, `submissions/` variants) **Failure scenario:** Skeleton uses `h-8 w-48` title + 5× `h-10 w-full` rows. The actual pages have filter rows, multi-column tables, and action buttons above the table. Shape mismatch during hydration causes visible reflow and does not communicate to users what they are waiting for. **Fix:** Model skeletons after real page layout — narrow cells at expected column proportions, with a filter ba...

### LOW: Admin skeleton loading pages lack accessible busy announcement

- **Flagged by:** designer
- **Details:** **Files:** - `src/app/(dashboard)/dashboard/admin/loading.tsx` - `src/app/(dashboard)/dashboard/admin/users/loading.tsx` - `src/app/(dashboard)/dashboard/admin/submissions/loading.tsx` - `src/app/(public)/groups/loading.tsx` - `src/app/(public)/problems/loading.tsx`  **Failure scenario:** Screen reader users navigating to admin pages during load encounter bare `<Skeleton>` elements with no announcement. The root `src/app/(dashboard)/loading.tsx` correctly uses `role="status" aria-label={t("lo...

### LOW: Advisory lock hash collisions can serialize unrelated users' submissions

- **Flagged by:** architect
- **Location(s):** `src/app/api/v1/submissions/route.ts:349`
- **Details:** **File:** `src/app/api/v1/submissions/route.ts:349`  ```typescript pg_advisory_xact_lock(hashtextextended(userId, 0)::bigint) ```  **Observation:**   `hashtextextended(userId, 0)` maps arbitrary-length UUIDs to a 64-bit bigint. With a birthday paradox probability, collisions between distinct user IDs are expected at scale. A collision causes two unrelated users' submission inserts to serialize behind a single advisory lock, blocking one while the other's transaction completes. At low user cou...

### LOW: Anti-cheat heartbeat best-effort

- **Flagged by:** security-analyzer

### LOW: Anti-cheat heartbeat flag written outside the submission INSERT transaction

- **Flagged by:** tracer
- **Details:** **Severity: LOW** **Confidence: MEDIUM**  **Location:** `src/app/api/v1/submissions/route.ts` — stale-heartbeat audit write after `tx.commit()`  **Causal chain:**  1. Submission INSERT, advisory lock, rate-limit checks, and exam-window validation all execute inside a single `db.transaction`. 2. After the transaction commits, the code records the stale-heartbeat flag (when the student's last CLIENT_EVENT heartbeat is >90s stale) in a separate write outside the transaction. 3. If the process cr...

### LOW: Assistant self-rejudge

- **Flagged by:** security-analyzer

### LOW: CSV column headers are hardcoded English strings regardless of locale.

- **Flagged by:** instructor-reviewer
- **Location(s):** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:61`
- **Details:** - **File:** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:61` - **Severity:** LOW | **Confidence:** HIGH  ---

### LOW: Code similarity is intra-platform only.

- **Flagged by:** applicant-reviewer
- **Details:** ---

### LOW: Contest card links produce excessively verbose accessible names

- **Flagged by:** designer
- **Location(s):** `src/app/(public)/_components/public-contest-list.tsx:68,114`
- **Details:** **File:** `src/app/(public)/_components/public-contest-list.tsx:68,114` **Failure scenario:** A screen reader user navigating the contest list hears the entire card's text as one link label: title + group name + problem count + public problem count + start date + deadline + all badge text. This produces multi-second announcements per item and makes list scanning with SR impractical. ```tsx // Current — no aria-label; accessible name = all card text <Link key={contest.id} href={contest.href} c...

### LOW: Countdown timer urgency relies solely on color + animation

- **Flagged by:** designer
- **Location(s):** `src/components/exam/countdown-timer.tsx:27`
- **Details:** **File:** `src/components/exam/countdown-timer.tsx:27` **Failure scenario:** When exam time < 1 minute, `animate-pulse` and `text-destructive` fire. Users with `prefers-reduced-motion` lose the pulse (correctly suppressed by `globals.css`). Users with red-green color blindness lose the color cue. Screen readers receive no announcement when the timer enters the critical zone — only a visual-only urgency signal exists. ```tsx if (ms < 1 * 60 * 1000) return "text-destructive animate-pulse"; ``` ...

### LOW: Coverage threshold (40% functions) too permissive; unimported security modules escape reporting entirely

- **Flagged by:** test-engineer
- **Location(s):** `vitest.config.ts:30`
- **Details:** **File:** `vitest.config.ts:30` **Confidence:** CONFIRMED  The unit coverage config sets `functions: 40` globally and 90% per-module for `src/lib/security/**` and `src/lib/auth/**`. However, v8 coverage only reports on files *actually imported* during the test run. The four modules with zero tests (F-01 through F-05: `sandbox-gate.ts`, `hcaptcha.ts`, `production-config.ts`, `derive-key.ts`) are **never imported**, so they do not appear in coverage output and contribute 0% to the threshold den...

### LOW: DELETE inside serializing advisory lock in SSE slot acquire

- **Flagged by:** perf-reviewer
- **Location(s):** `src/lib/realtime/realtime-coordination.ts:93`
- **Details:** **Severity:** MEDIUM | **Confidence:** CONFIRMED **File:** `src/lib/realtime/realtime-coordination.ts:93`  ```ts return withPgAdvisoryLock("realtime:sse:acquire", async (tx) => {   await tx.delete(realtimeCoordination).where(     and(sql`key LIKE ${getSsePrefixPattern()}`, lt(realtimeCoordination.expiresAt, nowMs))   );   // ... count, insert ... }); ```  The expired-entry DELETE runs under the global advisory lock (see F1). In pathological cases (e.g., after a server restart where hundreds o...

### LOW: Data table `<th>` elements missing `scope="col"`

- **Flagged by:** designer
- **Location(s):** `src/app/(public)/_components/public-problem-list.tsx:120-128`
- **Details:** **Files:** `src/components/ui/table.tsx` (base); `src/app/(public)/_components/public-problem-list.tsx:120-128` and all admin table pages **Failure scenario:** Screen reader users navigating the problem list or admin tables (users, submissions, audit logs) by cell cannot determine column/row header relationships without `scope`. WCAG 1.3.1 (Info and Relationships) requires programmatic association for data tables. **Fix:** Set `scope="col"` as the default in the base `TableHead` component: ``...

### LOW: Data tables missing `<caption>` for screen reader orientation

- **Flagged by:** designer
- **Details:** **Files:** `src/app/(public)/_components/public-problem-list.tsx`, admin table pages (users, submissions, audit-logs) **Failure scenario:** Screen reader users Tab into a data table. Without a `<caption>`, the table has no accessible name. The user must explore headers and rows to understand what the table contains — a poor first-contact experience especially in admin pages with multiple adjacent tables. **Fix:** Add a visually hidden caption to each table: ```tsx <Table>   <caption className...

### LOW: Dead-letter queue silent prune with no admin UI.

- **Flagged by:** admin-reviewer
- **Location(s):** `executor.rs:1002`
- **Details:** Per prior review (`executor.rs:1002`): dead-letter entries are silently deleted beyond 1000 items. No admin page exposes DLQ count or lets the operator requeue a failed submission. No Prometheus gauge for DLQ depth. - Fix: `GET /api/v1/admin/workers/dead-letter` returning count + metadata. Surface in the admin   workers dashboard. Emit `judgekit_dead_letter_count` gauge. Alert when count exceeds a   configurable threshold.

### LOW: Deprecated nginx HTTP/2 listen syntax remains in generated and checked-in configs

- **Flagged by:** code-reviewer
- **Location(s):** `deploy-docker.sh:1452-1453`, `scripts/online-judge.nginx.conf:27-40`, `static-site/static.nginx.conf:10-11`
- **Details:** - Severity: Low/Medium - Confidence: High - Evidence: `deploy-docker.sh:1452-1453`, `scripts/online-judge.nginx.conf:27-40`, `static-site/static.nginx.conf:10-11`. - Problem: the configs use `listen ... ssl http2`, which current nginx versions warn is deprecated. The cycle-2 deploy plan already recorded this as an observed deploy warning. - Failure scenario: a future nginx package tightens this from warning to invalid config, causing `nginx -t` to fail during the per-cycle deploy after the ap...

### LOW: Docker Compose has no explicit network segmentation

- **Flagged by:** security-reviewer
- **Location(s):** `db:5432`, `judge-worker:3001`, `app:3000`
- **Details:** **Severity:** MEDIUM   **Category:** A04 Insecure Design   **Location:** `docker-compose.production.yml` (no `networks:` block)   **Exploitability:** Requires compromise of any container on the default bridge network   **Blast Radius:** A compromised `code-similarity` or `rate-limiter` container can reach `db:5432` (PostgreSQL), `judge-worker:3001` (runner), and `app:3000` — all services on the default bridge  **Issue:**   No explicit Docker networks are defined. All services (`db`, `app`, `j...

### LOW: Dummy password hash encodes identifiable string

- **Flagged by:** security-reviewer
- **Location(s):** `src/lib/auth/config.ts:52`
- **Details:** **Severity:** LOW   **Category:** A02 Cryptographic Failures (hygiene)   **Location:** `src/lib/auth/config.ts:52`    **Issue:**   ```typescript const DUMMY_PASSWORD_HASH =   "$argon2id$v=19$m=19456,t=2,p=1$Y2xhdWRlZHVtbXloYXNo$KQH6bMKH3t2fGK8qMJzrOGmG5bNRVZ0bQfO7aDVz0Zk"; ```  The salt `Y2xhdWRlZHVtbXloYXNo` base64-decodes to `claudedummyhash`. This makes the dummy hash trivially identifiable by anyone with access to source code or a cracking database. While the dummy hash is used only for t...

### LOW: E2E data-dependent `test.skip(true)` pattern hides absent data as passing

- **Flagged by:** test-engineer
- **Location(s):** `tests/e2e/contest-participant-audit.spec.ts:50-140`, `tests/e2e/student-submission-flow.spec.ts:183`, `tests/e2e/contest-full-lifecycle.spec.ts:297,319,378,399`
- **Details:** **File:** `tests/e2e/contest-participant-audit.spec.ts:50-140` (extends F-06) **Confidence:** CONFIRMED  Beyond the always-skip issue in F-06, the broader pattern of discovering data at runtime and conditionally skipping is fragile across multiple specs. When run against a freshly deployed server with no seeded contests, all three `describe` blocks in `contest-participant-audit.spec.ts` skip silently. The `npm run test:e2e` gate passes. No one notices the feature was never verified.  The same...

### LOW: Error boundary pages lack live-region announcement

- **Flagged by:** designer
- **Location(s):** `src/app/(dashboard)/error.tsx:17-39`
- **Details:** **Files:** `src/app/(dashboard)/error.tsx:17-39`, `src/app/(dashboard)/dashboard/admin/error.tsx`, `src/app/(public)/problems/error.tsx` **Failure scenario:** A Next.js client-side navigation error replaces the page content with the error boundary. There is no `role="alert"` or `aria-live` on the error container, so screen readers operating the virtual cursor may not announce the error occurred — the user must manually discover the message. ```tsx // Current — no alert role <div className="fl...

### LOW: Exam session start is idempotent (good), but not communicated.

- **Flagged by:** applicant-reviewer
- **Details:** ---

### LOW: Extra SELECT after final verdict update (could use RETURNING)

- **Flagged by:** perf-reviewer
- **Details:** **Severity:** LOW | **Confidence:** CONFIRMED **File:** `src/app/api/v1/judge/poll/route.ts:~156`  ```ts // ...transaction commits the UPDATE... const updated = await db.query.submissions.findFirst({   where: eq(submissions.id, submissionId),   columns: { sourceCode: false }, }); return apiSuccess(updated); ```  After the final-verdict transaction commits, a separate `findFirst` query fetches the updated row for the response. The same pattern appears in the in-progress branch (`updatedInProgr...

### LOW: Extra SELECT after submission insert

- **Flagged by:** perf-reviewer
- **Details:** **Severity:** LOW | **Confidence:** CONFIRMED **File:** `src/app/api/v1/submissions/route.ts:~280`  ```ts await tx.insert(submissions).values({ id, userId, ..., submittedAt: dbNow }); // ... const [submission] = await db.select({ id, userId, ... }).from(submissions).where(eq(submissions.id, id)).limit(1); ```  All field values are known at insert time. The post-insert SELECT only exists to return a typed response object.  **Suggested fix:** Use `.returning()` on the insert, or construct the r...

### LOW: Filesystem path disclosed in admin restore/import API responses

- **Flagged by:** security-reviewer
- **Location(s):** `src/app/api/v1/admin/restore/route.ts:233-240`, `src/app/api/v1/admin/migrate/import/route.ts:135,246`
- **Details:** **Severity:** MEDIUM   **Category:** A09 Security Logging and Monitoring Failures (information disclosure)   **Location:** `src/app/api/v1/admin/restore/route.ts:233-240`, `src/app/api/v1/admin/migrate/import/route.ts:135,246`   **Exploitability:** Requires `system.backup` capability; authenticated admin only   **Blast Radius:** Leaks server-side filesystem path structure (e.g. `/home/deployer/data/pre-restore-snapshots/...`) useful for lateral movement after initial access  **Issue:**   The ...

### LOW: Global serializing advisory lock on every SSE connection

- **Flagged by:** perf-reviewer
- **Location(s):** `src/lib/realtime/realtime-coordination.ts:75`
- **Details:** **Severity:** HIGH | **Confidence:** CONFIRMED **File:** `src/lib/realtime/realtime-coordination.ts:75`  ```ts return withPgAdvisoryLock("realtime:sse:acquire", async (tx) => {   // DELETE expired, COUNT connections, INSERT new slot — all under one lock }); ```  `withPgAdvisoryLock("realtime:sse:acquire", ...)` translates to `SELECT pg_advisory_xact_lock(hash("realtime:sse:acquire"))` inside a transaction — a **single global serializing lock** shared by every SSE connection attempt from every...

### LOW: Group-level export vs. contest export use different permission guards for the same assignment data.

- **Flagged by:** assistant-reviewer
- **Location(s):** `groups/[id]/assignments/[assignmentId]/export/route.ts:28`, `contests/[assignmentId]/export/route.ts:50`
- **Details:** - Group export (`groups/[id]/assignments/[assignmentId]/export/route.ts:28`): `canManageGroupResourcesAsync` — TAs blocked. - Contest export (`contests/[assignmentId]/export/route.ts:50`): `canViewAssignmentSubmissions` — TAs pass. - Same underlying data, different TA access depending on which URL they navigate to. Not a security issue (both paths are read-only) but creates inconsistent mental model. Recommend aligning to `canViewAssignmentSubmissions` for both.  ---

### LOW: Hard cap of 100 test cases per problem (`src/lib/validators/problem-import.ts:35`: `.max(100, "tooManyTestCases")`). Competitive problems commonly need 200–300 test cases. The UI's per-case textarea is impractical for large suites anyway (use ZIP), but the import route enforces the same cap.

- **Flagged by:** instructor-reviewer
- **Details:** - **Suggested fix:** Raise the cap or make it operator-configurable; ZIP imports already bypass the textarea bottleneck. - **Severity:** LOW | **Confidence:** HIGH  ---

### LOW: ICPC score overrides not applied in leaderboard rankings

- **Flagged by:** tracer
- **Details:** **Severity: INFO (documented deferral)** **Confidence: HIGH**  **Location:** `src/lib/assignments/contest-scoring.ts` — `computeContestRanking`  **Causal chain:**  ICPC penalty-time and rank overrides are not applied in `computeContestRanking`. This is acknowledged in code comments as a deliberate deferral. The impact is that admin-issued ICPC score adjustments do not appear in the leaderboard until the feature is implemented.  **No action required** until the ICPC override implementation lan...

### LOW: IOI score override replaces the late-penalty-adjusted score, but the override value is treated as a raw score

- **Flagged by:** tracer
- **Details:** **Severity: LOW** **Confidence: MEDIUM**  **Location:** `src/lib/assignments/scoring.ts` — `buildIoiLatePenaltyCaseExpr`; `src/lib/assignments/contest-scoring.ts` — override overlay  **Causal chain:**  1. For a late submission, `buildIoiLatePenaltyCaseExpr` returns `bestScore * (1 - latePenalty)` as the adjusted score. 2. The score override overlay (in `getAssignmentStatusRows`) replaces the adjusted score column with the `overrides.score` value. 3. The override is intended to represent the f...

### LOW: Judge API endpoints accessible from any IP by default

- **Flagged by:** security-reviewer
- **Location(s):** `src/lib/judge/ip-allowlist.ts:182-210`
- **Details:** **Severity:** HIGH   **Category:** A01 Broken Access Control / A05 Security Misconfiguration   **Location:** `src/lib/judge/ip-allowlist.ts:182-210`   **Exploitability:** Remote, requires knowledge of `JUDGE_AUTH_TOKEN`   **Blast Radius:** Leaked `JUDGE_AUTH_TOKEN` allows any host to register fake workers, claim submissions (reads `sourceCode` + all hidden `testCases`), and inject arbitrary judge verdicts  **Issue:**   When `JUDGE_ALLOWED_IPS` is unset (the documented default), `isJudgeIpAllo...

### LOW: Judge worker: 3 subprocess spawns per test case (run + inspect + rm)

- **Flagged by:** perf-reviewer
- **Details:** **Severity:** MEDIUM | **Confidence:** CONFIRMED **File:** `judge-worker-rs/src/docker.rs:run_docker_once`  For every test case the executor calls: 1. `docker run ...` — spawns container, waits for exit 2. `docker inspect ...` — reads OOM status, StartedAt/FinishedAt, container ID 3. `docker rm -f ...` — removes the container  Three separate `tokio::process::Command` forks per test case. For a problem with 50 test cases, this is 150 `docker` CLI invocations per submission.  **Failure scenario...

### LOW: Judge workspaces on host disk rather than tmpfs

- **Flagged by:** perf-reviewer
- **Details:** **Severity:** MEDIUM | **Confidence:** CONFIRMED **File:** `docker-compose.production.yml` (judge-worker service)  ```yaml volumes:   - /judge-workspaces:/judge-workspaces environment:   - TMPDIR=/judge-workspaces ```  `tempfile::TempDir::new()` in `executor.rs` respects `TMPDIR=/judge-workspaces`, so all compile workspaces land on the host filesystem. Compile operations (especially C++/Rust) produce many small intermediate files. The container's internal `/tmp` is correctly mounted as tmpfs,...

### LOW: LOW | Double DB fetch in `/api/v1/judge/heartbeat`

- **Flagged by:** debugger
- **Details:** **File:** `src/app/api/v1/judge/heartbeat/route.ts` (~line 58)  **Root cause:** `isJudgeAuthorizedForWorker` (in `src/lib/judge/auth.ts`) executes a `SELECT` to fetch `secretTokenHash` and validate it. The heartbeat handler then issues a second `SELECT` to fetch additional worker fields (last seen, hostname, etc.) from the same `judgeWorkers` row. One round-trip is redundant.  **Failure scenario:** Not a correctness bug. Under sustained high heartbeat frequency this doubles DB reads for every...

### LOW: LOW — `expect(worvEnv).not.toContain("oj.worv.ai")` has no existence guard — trivially passes when file is absent

- **Flagged by:** verifier
- **Location(s):** `tests/unit/infra/deploy-storage-safety.test.ts:70`
- **Details:** **File:** `tests/unit/infra/deploy-storage-safety.test.ts:70`   **Confidence:** HIGH — confirmed by reading `readIfExists` implementation and the assertion without guard  **Description:**   At line 70, `expect(worvEnv).not.toContain("oj.worv.ai")` is executed unconditionally regardless of whether `.env.deploy.worv` exists. `readIfExists` returns `""` (empty string) when the file is absent. `"".includes("oj.worv.ai")` is `false`, so `not.toContain` always passes. In contrast, lines 66-70 wrap ...

### LOW: Locale switch triggers hard `window.location.reload()` destroying page state

- **Flagged by:** designer
- **Location(s):** `src/components/layout/locale-switcher.tsx:50`
- **Details:** **File:** `src/components/layout/locale-switcher.tsx:50` **Failure scenario:** A user in the middle of composing a problem submission selects a different locale from the dropdown. `window.location.reload()` instantly destroys all editor state, localStorage draft (before it can be saved), scroll position, and focus location. During exam sessions this is catastrophic — code in progress is lost with no warning. ```tsx function setLocale(locale: string) {   // cookie set …   window.location.reloa...

### LOW: Login recruiting-candidate hint fires on ALL errors

- **Flagged by:** designer
- **Location(s):** `src/app/(auth)/login/login-form.tsx:98-115`
- **Details:** **File:** `src/app/(auth)/login/login-form.tsx:98-115` **Failure scenario:** A regular user mistypes their password. They see two messages: (1) "Invalid credentials" and (2) the recruiting hint ("Are you a recruiting candidate? Check your invitation link"). This hint is irrelevant and confusing for non-recruiting users. For server errors or quota-exceeded errors it is actively misleading. Both messages share the same `error` state with no differentiation. ```tsx // Current — hint fires on ANY...

### LOW: Missing compound index for anti-cheat heartbeat gap detection

- **Flagged by:** perf-reviewer
- **Location(s):** `src/lib/db/schema.pg.ts:1207`
- **Details:** **Severity:** MEDIUM | **Confidence:** CONFIRMED **File:** `src/lib/db/schema.pg.ts:1207`, anti-cheat route heartbeat query  Existing indexes on `anti_cheat_events`: ``` ace_assignment_user_idx    ON (assignment_id, user_id) ace_assignment_type_idx    ON (assignment_id, event_type) ace_assignment_created_idx ON (assignment_id, created_at) ```  The heartbeat gap detection query (anti-cheat GET with `includeGaps=1`) is: ```sql WHERE assignment_id = $1 AND user_id = $2 AND event_type = 'heartbea...

### LOW: Mobile nav panel missing `aria-modal`

- **Flagged by:** designer
- **Location(s):** `src/components/layout/public-header.tsx:273-285`
- **Details:** **File:** `src/components/layout/public-header.tsx:273-285` **Failure scenario:** VoiceOver / NVDA users in virtual cursor (browse) mode can navigate past the focus trap into background content when the mobile menu is open. The Tab focus trap correctly contains keyboard users, but `role="region"` does not declare a modal boundary — AT virtual cursor remains free to roam. ```tsx // Current <div ref={panelRef} id={menuId} role="region" aria-label={…} data-state="open" …> ``` **Fix:** ```tsx <di...

### LOW: Module-level mutable `adminPassword` in `function-judging-responsive.spec.ts` is a flakiness vector

- **Flagged by:** qa-tester
- **Location(s):** `tests/e2e/function-judging-responsive.spec.ts:52`
- **Details:** **Severity:** Low | **Confidence:** PLAUSIBLE  **File:** `tests/e2e/function-judging-responsive.spec.ts:52`   **Failure scenario:** `let adminPassword = DEFAULT_CREDENTIALS.password` is declared at module scope and mutated when a forced-change flow occurs. Because `workers: 1` is set globally, parallel execution is currently prevented. But if parallelism is ever enabled (or if a future refactor removes `test.use`-level constraints), two test workers sharing this module could race on `adminPas...

### LOW: No "mark as boilerplate / investigate further" action on similarity pairs.

- **Flagged by:** assistant-reviewer
- **Details:** - The pairs table is read-only. I cannot annotate "this pair is clearly boilerplate, skip" or "escalate to instructor." Any investigation notes live outside the platform.  ---

### LOW: No "view as student" read-only mode.

- **Flagged by:** assistant-reviewer
- **Details:** - To investigate a "my code passed locally but got WA," I open the submission page directly. There is no toggle to see what the student-facing error message looks like. `submissions.view_source` changes what the detail view shows, so I cannot verify the student experience without separate testing.  ---

### LOW: No GDPR/PIPA data deletion playbook.

- **Flagged by:** admin-reviewer
- **Location(s):** `scripts/check-high-stakes-runtime.sh:22-27`, `src/lib/realtime/realtime-coordination.ts:238-279`
- **Details:** When a candidate requests data deletion, there is no documented procedure for identifying all records, removing them from the live DB, preventing backups from re-introducing them, and issuing a deletion confirmation. Required within 30 days under Korean PIPA.  **I4 (LOW) — `check-high-stakes-runtime.sh` requires `REALTIME_COORDINATION_BACKEND=postgresql` for multi-instance, but that backend is declared-not-implemented.** `scripts/check-high-stakes-runtime.sh:22-27`: multi-instance (APP_INSTAN...

### LOW: No SSL cert expiry monitoring.

- **Flagged by:** admin-reviewer
- **Location(s):** `scripts/bootstrap-instance.sh:273`
- **Details:** `scripts/bootstrap-instance.sh:273` enables `certbot.timer` but renewal failures produce no alert. `monitor-health.sh` does not check cert expiry. - Fix: add to `monitor-health.sh`:   ```bash   check_ssl_expiry() {     local domain="${DOMAIN:-}"     [[ -z "$domain" ]] && return 0     local expiry days     expiry=$(echo | openssl s_client -connect "${domain}:443" \       -servername "${domain}" 2>/dev/null \       | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true)     [[ -z "$ex...

### LOW: No bulk role audit report.

- **Flagged by:** admin-reviewer
- **Details:** No operator-accessible "current role matrix" export for end-of-term compliance review. - Fix: `GET /api/v1/admin/users/export?format=csv` returning `id,username,email,role,lastLogin`,   gated to admin/super_admin.  ---

### LOW: No capacity planning document.

- **Flagged by:** admin-reviewer
- **Details:** There is no recorded measurement of how many concurrent submissions a single worker handles at `JUDGE_CONCURRENCY=4` (the worker-compose default). For a 120-student exam where everyone submits in the last 5 minutes, there is no baseline to determine whether the fleet can keep up. - Fix: run `stress-tests.mjs` (already in repo) against staging; record results in   `docs/ops/capacity.md` with host spec and concurrency settings.  ---

### LOW: No drop-lowest-assignment policy across a group. Grading "best N of M assignments" must be done manually in a spreadsheet after export.

- **Flagged by:** instructor-reviewer
- **Details:** - **Severity:** LOW | **Confidence:** HIGH  ---

### LOW: No e2e coverage for password reset / forgot-password flow

- **Flagged by:** qa-tester
- **Details:** **Severity:** Medium | **Confidence:** CONFIRMED  **File:** `tests/e2e/auth-flow.spec.ts` (coverage gap)   **Failure scenario:** `auth-flow.spec.ts` covers login, logout, invalid credentials, and unauthenticated redirect. The routes `/forgot-password`, `/reset-password`, `/verify-email`, and `/api/v1/auth/forgot-password` have zero e2e coverage. A regression in any step of the password reset flow (token generation, email template rendering, token validation, new-password submission) would be ...

### LOW: No grace period / late-submission buffer. Many instructors allow a 5-minute submission buffer for students with slow upload speeds. There is no grace-period field; submissions after the deadline are immediately flagged late.

- **Flagged by:** instructor-reviewer
- **Details:** - **Severity:** LOW | **Confidence:** MEDIUM  ---

### LOW: No image rollback mechanism.

- **Flagged by:** admin-reviewer
- **Details:** Only `:latest` tag is produced. A regression found 10 minutes post-deploy requires git-revert + full rebuild (15–30 min downtime). No `:previous` tag is created. - Fix: before each `docker build`, `docker tag judgekit-app:latest judgekit-app:previous 2>/dev/null || true`. Add `scripts/rollback-deploy.sh`.  ---

### LOW: No notification to students when assignment description is edited. A silent description edit mid-assignment is invisible to students already viewing the problem.

- **Flagged by:** instructor-reviewer
- **Details:** - **Severity:** LOW | **Confidence:** HIGH  ---

### LOW: No npm script for the post-deploy smoke profile

- **Flagged by:** qa-tester
- **Details:** **Severity:** Low | **Confidence:** CONFIRMED  **File:** `package.json` (`scripts` section)   **Failure scenario:** Post-deploy verification requires `PLAYWRIGHT_PROFILE=smoke PLAYWRIGHT_BASE_URL=https://algo.xylolabs.com npx playwright test`, but there is no dedicated `test:e2e:smoke` script. Developers running the default `npm run test:e2e` locally do not get smoke-profile behavior. The distinction between "full local regression" and "remote smoke" is only documented in the playwright confi...

### LOW: No per-problem "run before submit" reminder.

- **Flagged by:** applicant-reviewer
- **Details:** ---

### LOW: No pre-test editor sanity check.

- **Flagged by:** applicant-reviewer
- **Details:** ---

### LOW: No side-by-side live preview. The write/preview toggle (`create-problem-form.tsx:595–670`) requires a full tab switch to check KaTeX. For long problem statements with 10+ equations this is painful.

- **Flagged by:** instructor-reviewer
- **Details:** - **Suggested fix:** Add a split-view toggle that renders `ProblemDescription` inline at 50 % width while the textarea occupies the other half. - **Severity:** LOW | **Confidence:** HIGH

### LOW: Password match/mismatch indicator not announced to screen readers

- **Flagged by:** designer
- **Location(s):** `src/app/(auth)/signup/signup-form.tsx:210-223`
- **Details:** **File:** `src/app/(auth)/signup/signup-form.tsx:210-223` **Failure scenario:** A blind user fills in "Confirm Password". The `<p>` elements for "passwords match" / "do not match" have no `role="alert"` or `aria-live`. Nothing is announced on state change. The user must submit to discover a mismatch via the form error, which is a much harsher failure mode. ```tsx // Current — silent state change, no announcement {passwordsMatch && (   <p className="flex items-center gap-1 text-sm text-green-6...

### LOW: Phone-first scenario not handled.

- **Flagged by:** applicant-reviewer

### LOW: Poll in-progress path reads submission back outside the transaction

- **Flagged by:** tracer
- **Location(s):** `src/app/api/v1/judge/poll/route.ts:120-129`
- **Details:** **Severity: LOW** **Confidence: HIGH**  **Location:** `src/app/api/v1/judge/poll/route.ts:120-129`  **Causal chain:**  1. The in-progress update is committed inside `execTransaction` (lines 87-112). 2. After the transaction, the code performs `db.query.submissions.findFirst` (line 120-125) to fetch the updated state and return it to the worker. 3. Between the UPDATE commit and the SELECT, another concurrent operation (another poll for the same submission, a rejudge, a claim timeout sweep) cou...

### LOW: Post-deploy smoke E2E_PASSWORD placeholder confuses signal.

- **Flagged by:** admin-reviewer
- **Location(s):** `deploy-docker.sh:1665`
- **Details:** `deploy-docker.sh:1665`: `E2E_PASSWORD="${E2E_PASSWORD:-skip-login}"`. Login specs then attempt authentication with the literal string `skip-login`. The spec fails; the operator sees "post-deploy smoke FAILED" and cannot distinguish genuine 500 regressions from missing credentials. `ALLOW_DEPLOY_WITH_FAILED_SMOKE=1` is then set to unblock, defeating the safety net. - Fix: if `E2E_PASSWORD == "skip-login"`, emit `test.skip()` for all login-dependent specs.   Or split `PLAYWRIGHT_PROFILE=smoke-...

### LOW: Privacy page hardcodes retention periods.

- **Flagged by:** admin-reviewer
- **Details:** Retention periods (90, 30, 180, etc. days) are literal integers in the privacy page component, not read from `DATA_RETENTION_DAYS`. If an operator sets `AUDIT_EVENT_RETENTION_DAYS=365`, the privacy page still says "90 days." Carry-forward from C3-F8 in prior cycles.  ---

### LOW: Problem success-rate uses color as the sole visual differentiator

- **Flagged by:** designer
- **Location(s):** `src/app/(public)/_components/public-problem-list.tsx:158-174`
- **Details:** **File:** `src/app/(public)/_components/public-problem-list.tsx:158-174` **Failure scenario:** Users with protanopia/deuteranopia cannot distinguish the three success-rate tiers (green ≥60% / yellow 30-60% / red <30%). The three icons (`CircleCheck`, `CircleAlert`, `CircleX`) are `aria-hidden="true"`, providing no AT fallback either. Both color and AT meaning are lost simultaneously. ```tsx // All three icons are aria-hidden="true" — no SR fallback <CircleCheck className="size-3.5" aria-hidde...

### LOW: Rate-limit check: every allowed request pays 3 DB operations

- **Flagged by:** perf-reviewer
- **Details:** **Severity:** MEDIUM | **Confidence:** CONFIRMED **File:** `src/lib/security/api-rate-limit.ts:atomicConsumeRateLimit`  ```ts const now = await getDbNowMs();            // op 1: SELECT NOW() const limited = await execTransaction(async (tx) => {   let existing = await fetchRateLimitEntry(tx, key);  // op 2: SELECT FOR UPDATE   // ...   await tx.update(rateLimits).set(...);    // op 3: UPDATE }); ```  When the rate-limiter sidecar allows the request (or is unreachable), the DB path runs three o...

### LOW: Results page gated on both `closed` AND `showResultsToCandidate`.

- **Flagged by:** applicant-reviewer
- **Details:** ---

### LOW: Runner binds `0.0.0.0`, token-only

- **Flagged by:** security-analyzer

### LOW: SSE batch-poll IN clause grows up to 500 elements

- **Flagged by:** perf-reviewer
- **Details:** **Severity:** LOW | **Confidence:** PLAUSIBLE **File:** `src/app/api/v1/submissions/[id]/events/route.ts:sharedPollTick`  ```ts const submissionIds = Array.from(submissionSubscribers.keys()); const results = await db   .select({ id: submissions.id, status: submissions.status })   .from(submissions)   .where(inArray(submissions.id, submissionIds)); ```  With MAX_GLOBAL_SSE_CONNECTIONS=500 and each connection watching a different submission, `submissionIds` can hold 500 distinct IDs. Drizzle ge...

### LOW: SSE poll-timer interval is frozen at first-subscriber startup

- **Flagged by:** perf-reviewer
- **Details:** **Severity:** MEDIUM | **Confidence:** CONFIRMED **File:** `src/app/api/v1/submissions/[id]/events/route.ts:~182`  ```ts function startSharedPollTimer(): void {   const configuredInterval = getConfiguredSettings().ssePollIntervalMs;   const pollIntervalMs = Math.max(1000, configuredInterval);   globalThis.__submissionEventsSharedPollTimer = setInterval(() => {     void sharedPollTick();   }, pollIntervalMs); ```  `ssePollIntervalMs` is read **once** when the first SSE subscriber connects and ...

### LOW: Score override input has no client-side upper-bound guard.

- **Flagged by:** assistant-reviewer
- **Location(s):** `src/app/(public)/groups/[id]/assignments/[assignmentId]/score-override-dialog.tsx:159`
- **Details:** - File: `src/app/(public)/groups/[id]/assignments/[assignmentId]/score-override-dialog.tsx:159` - Code: `<Input type="number" min={0} ...>` — no `max` attribute. - Scenario: TA types 500 for a 10-point problem, clicks Save. Server returns 400 `overrideScoreExceedsMax` but the toast fires only the generic `overrideSaveFailed` string — no hint of what went wrong. The field stays dirty. - Fix: Add `max={maxPoints}` to the Input and add `scoreNum > maxPoints` guard in `handleSave` before the API ...

### LOW: Shell command validation bypassed when Rust runner is configured

- **Flagged by:** security-reviewer
- **Location(s):** `src/lib/compiler/execute.ts:639-715`
- **Details:** **Severity:** MEDIUM   **Category:** A03 Injection / A04 Insecure Design   **Location:** `src/lib/compiler/execute.ts:639-715`   **Exploitability:** Requires admin-level DB write access (language_configs table) or a compromised admin account   **Blast Radius:** Malicious compile/run commands execute inside the Docker sandbox; sandbox escape is bounded by seccomp + no-new-privileges + --cap-drop=ALL + --network=none  **Issue:**   `validateShellCommandStrict()` (which checks command prefixes ag...

### LOW: Skeleton loading pages don't match actual content shape

- **Flagged by:** designer
- **Details:** **Files:** `src/app/(dashboard)/dashboard/admin/loading.tsx`, `src/app/(public)/problems/loading.tsx` **Failure scenario:** Both loaders show a narrow title skeleton + 5 full-width uniform rows. The actual problem list renders a heading, filter bar, and an 8-column table with varied column widths. The shape mismatch causes visible layout reflow on data arrival and fails to establish content expectations. **Fix:** Mirror the real content structure with column-proportioned skeleton cells matchi...

### LOW: Static-site nginx missing security response headers

- **Flagged by:** security-reviewer
- **Details:** **Severity:** LOW   **Category:** A05 Security Misconfiguration   **Location:** `static-site/nginx.conf`    **Issue:** The static-site nginx config ships no `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, or `Referrer-Policy` headers. While the static site serves only documentation/problem sets, missing headers increase risk if any HTML with external scripts is ever served.  **Fix:** Add to `static-site/nginx.conf`: ```nginx add_header X-Content-Type-Options "nosniff" ...

### LOW: Submit button label includes keyboard shortcut text verbatim

- **Flagged by:** designer
- **Location(s):** `src/components/problem/problem-submission-form.tsx:487`
- **Details:** **File:** `src/components/problem/problem-submission-form.tsx:487` **Failure scenario:** Screen reader announces "Submit (⌘+Enter)" or "Submit (Ctrl+Enter)" — the parenthetical shortcut is read aloud, cluttering the accessible label. This is especially noisy in exam contexts where submission is a high-stakes interaction. ```tsx {isSubmitting ? tCommon("loading") : `${tCommon("submit")} (${submitShortcutLabel})`} ``` **Fix:** Use `aria-keyshortcuts` for machine-readable shortcut declaration an...

### LOW: Threshold hardcoded at 0.85 with no instructor control. Some instructors prefer 0.75 for stricter classes or 0.90 to reduce noise. The API endpoint accepts no threshold parameter.

- **Flagged by:** instructor-reviewer
- **Location(s):** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:34`
- **Details:** - **File:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:34` - **Suggested fix:** Accept optional `threshold` query param bounded to [0.5, 0.99]. - **Severity:** LOW | **Confidence:** HIGH  ---

### LOW: Token in candidateName exposure at re-entry.

- **Flagged by:** applicant-reviewer
- **Details:** ---

### LOW: Uncached `count(*) FROM submissions` on every homepage render

- **Flagged by:** perf-reviewer
- **Location(s):** `src/lib/homepage-insights.ts:17`
- **Details:** **Severity:** HIGH | **Confidence:** CONFIRMED **File:** `src/lib/homepage-insights.ts:17`  ```ts export async function getHomepageInsights(): Promise<HomepageInsights> {   const [problemRows, submissionRows, languageRows] = await Promise.all([     db.select({ count: count() }).from(problems).where(eq(problems.visibility, "public")),     db.select({ count: count() }).from(submissions),   // full table COUNT, no cache     db.select({ count: count() }).from(languageConfigs).where(eq(languageCon...

### LOW: Username is opaque.

- **Flagged by:** applicant-reviewer

### LOW: Worker staleness sweep interval is not admin-tunable

- **Flagged by:** architect
- **Location(s):** `src/lib/judge/worker-staleness-sweep.ts:99`
- **Details:** **File:** `src/lib/judge/worker-staleness-sweep.ts:99`  **Observation:**   The staleness sweep runs every 60 seconds (hardcoded constant). This is not exposed as a system setting. Operators who want faster stale-worker detection (e.g., during a cluster upgrade) or slower sweeps (to reduce DB load) must change source code and redeploy. Other operational parameters (session lifetime, rate limits, queue capacity) are admin-settable via `systemSettings` — the sweep interval is an inconsistent exc...

### LOW: `--muted-foreground` on `--muted` background fails WCAG AA (4.2:1 < 4.5:1)

- **Flagged by:** designer
- **Location(s):** `src/app/globals.css:62-63`, `problem-submission-form.tsx:491`
- **Details:** **File:** `src/app/globals.css:62-63` **Failure scenario:** Secondary text rendered with `text-muted-foreground` on any muted background violates WCAG 1.4.3.  Contrast calculation: - `--muted-foreground: oklch(0.48 0 0)` ≈ sRGB `#6C6C6C`, relative luminance ≈ 0.178 - `--muted: oklch(0.97 0 0)` ≈ sRGB `#F7F7F7`, relative luminance ≈ 0.909 - Ratio: (0.909 + 0.05) / (0.178 + 0.05) = **4.21:1 — fails AA (requires 4.5:1 for normal text)**  Affected surfaces: footer (`bg-muted/40`), page background...

### LOW: `AUTH_TRUST_HOST=true` defaults on in production Docker Compose

- **Flagged by:** security-reviewer
- **Location(s):** `docker-compose.production.yml:106`
- **Details:** **Severity:** HIGH   **Category:** A02 Cryptographic Failures / A05 Security Misconfiguration   **Location:** `docker-compose.production.yml:106`   **Exploitability:** Requires ability to inject/spoof `Host` or `X-Forwarded-Host` headers reaching the app container   **Blast Radius:** Host-header injection can redirect NextAuth OAuth callbacks, forge email links, or produce JWT tokens bound to an attacker-controlled domain  **Issue:**   ```yaml

### LOW: `COMPILER_RUNNER_URL` default assumes Docker Desktop host networking; breaks on Linux Docker without explicit `host-gateway` configuration

- **Flagged by:** tracer
- **Location(s):** `http://host.docker.internal:3001`
- **Details:** **Severity: LOW** **Confidence: MEDIUM**  **Location:** `deploy-docker.sh` — `COMPILER_RUNNER_URL` default initialization  **Causal chain:**  1. The default for `COMPILER_RUNNER_URL` is `http://host.docker.internal:3001`. 2. `host.docker.internal` resolves automatically on Docker Desktop (macOS/Windows) but **does not resolve on Linux Docker Engine** without adding `--add-host=host.docker.internal:host-gateway` to the compose service or `extra_hosts` in `docker-compose.yml`. 3. The production...

### LOW: `E2E_PASSWORD=skip-login` silently removes all auth-dependent specs from smoke run

- **Flagged by:** qa-tester
- **Location(s):** `playwright.config.ts:49–53`
- **Details:** **Severity:** Medium | **Confidence:** CONFIRMED  **File:** `playwright.config.ts:49–53`   **Failure scenario:** ```ts const hasRemoteSmokeCredentials =   !isRemoteRun || Boolean(process.env.E2E_PASSWORD && process.env.E2E_PASSWORD !== "skip-login"); ``` If a deploy pipeline passes `E2E_PASSWORD=skip-login` (perhaps as a "no auth" escape hatch), `hasRemoteSmokeCredentials` is `false`. The suite switches to `remoteSafeSpecsWithoutAuth`, dropping auth-flow, contest-nav, admin-workers, admin-lan...

### LOW: `EmptyState` component missing `role="status"` for dynamic list transitions

- **Flagged by:** designer
- **Location(s):** `src/components/empty-state.tsx:16`
- **Details:** **File:** `src/components/empty-state.tsx:16` **Failure scenario:** When filtering produces zero results, the table is replaced with `EmptyState`. There is no live-region signal. Screen readers are not notified of the transition; users must manually navigate to discover the empty message. **Fix:** ```tsx export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {   return (     <div role="status" className="flex flex-col items-center gap-3 py-8">       {/* … */} ...

### LOW: `SubmissionStatusBadge` tooltip wraps visible badge in invisible `<button>`

- **Flagged by:** designer
- **Location(s):** `src/components/submission-status-badge.tsx:250-252`
- **Details:** **File:** `src/components/submission-status-badge.tsx:250-252` **Failure scenario:** Keyboard users navigating a submissions list encounter a hidden `<button type="button" className="cursor-default border-none bg-transparent p-0">` at every submission row — in addition to any link in the same row. The button is visually zero-size and transparent, yet focusable, creating a phantom Tab stop. AT announces "button" with the badge text, which is confusing when adjacent to the actual submission lin...

### LOW: `all-languages-judge.spec.ts` detects ARM64 architecture by URL substring, breaking on new hosts

- **Flagged by:** qa-tester
- **Location(s):** `tests/e2e/all-languages-judge.spec.ts:10–11`
- **Details:** **Severity:** Medium | **Confidence:** CONFIRMED  **File:** `tests/e2e/all-languages-judge.spec.ts:10–11`   **Failure scenario:** ```ts const TARGET_IS_ARM64 = BASE_URL.includes("auraedu") || BASE_URL.includes(":arm64"); ``` If a new ARM64 deployment is added (e.g., `algo.xylolabs.com` migrates to Apple Silicon), `TARGET_IS_ARM64` is `false`. The test submits x86-64 NASM assembly (`_start` + `syscall` ABI) to an ARM64 judge, which produces a runtime error. The test then reports a false failur...

### LOW: `anti_cheat.run_similarity` capability is dead weight in the role capability matrix.

- **Flagged by:** assistant-reviewer
- **Location(s):** `src/lib/capabilities/defaults.ts:29`, `similarity-check/route.ts:21`
- **Details:** - File: `src/lib/capabilities/defaults.ts:29`; `similarity-check/route.ts:21` - Admins who grant this capability to a custom role are misled — it grants no additional power. The role editor (`admin/roles/capability-matrix.tsx`) displays it as a meaningful permission toggle.

### LOW: `autoindex on` in static-site nginx enables directory listing

- **Flagged by:** security-reviewer
- **Location(s):** `static-site/nginx.conf:21`
- **Details:** **Severity:** HIGH   **Category:** A05 Security Misconfiguration   **Location:** `static-site/nginx.conf:21`   **Exploitability:** Remote, unauthenticated   **Blast Radius:** Exposes any file placed in the static-site root (backup ZIPs, SQL dumps, tmp files) to any internet user with the URL    **Issue:**   `autoindex on` is set globally in the `location /` block. Any file the operator copies into `/usr/share/nginx/html/` becomes browseable without authentication — including accidental copies...

### LOW: `buildClaimSql(false)` no-worker code path is dead in production

- **Flagged by:** tracer
- **Details:** **Severity: INFO** **Confidence: MEDIUM**  **Location:** `src/lib/judge/claim-query.ts` — `buildClaimSql` function signature and branch  **Causal chain:**  The function accepts a boolean `withWorker` parameter to generate two variants of the claim CTE (with or without a specific worker). In production, the claim route always provides a `workerId`, so the `false` path is unreachable. The dead code branch is not harmful but adds maintenance surface.  **Suggested fix (optional):** Remove the `wi...

### LOW: `computeContestAnalytics` re-fetches assignment metadata already in ranking cache

- **Flagged by:** perf-reviewer
- **Details:** **Severity:** LOW | **Confidence:** PLAUSIBLE **File:** `src/lib/assignments/contest-analytics.ts:~90`  ```ts const [allAcSubs, contestMeta, cheatRows] = await Promise.all([   rawQueryAll<...>(`SELECT DISTINCT ON (s.user_id, s.problem_id) ...`),   rawQueryOne<...>(`SELECT starts_at, deadline, late_penalty, exam_mode FROM assignments ...`),   rawQueryAll<...>(`SELECT ... FROM anti_cheat_events ...`), ]); ```  `contestMeta` re-fetches `starts_at`, `deadline`, `late_penalty`, `exam_mode` — the s...

### LOW: `computeSingleUserLiveRank` runs a full CTE scan on every frozen leaderboard page

- **Flagged by:** perf-reviewer
- **Location(s):** `src/lib/assignments/leaderboard.ts:74`
- **Details:** **Severity:** MEDIUM | **Confidence:** CONFIRMED **File:** `src/lib/assignments/leaderboard.ts:74`  ```sql -- ICPC live rank path (cross-join all participants against target): FROM user_totals ut, target t WHERE ut.solved_count > t.solved_count OR ... ```  For every student fetching a **frozen** leaderboard, `computeSingleUserLiveRank` is called to show the student their own live rank. The ICPC variant is a Cartesian product (`user_totals × target`) over all submission data — equivalent to a ...

### LOW: `confirmPassword` field not linked to match-state indicator via `aria-describedby`

- **Flagged by:** designer
- **Location(s):** `src/app/(auth)/signup/signup-form.tsx:205-223`
- **Details:** **File:** `src/app/(auth)/signup/signup-form.tsx:205-223` **Failure scenario:** Even after H3 is fixed (live region added), the `confirmPassword` `<Input>` has no `aria-describedby` pointing to the match container. Screen reader users in forms mode will not encounter the match status when the field is focused; they must Tab away to discover the live-region update. **Fix:** ```tsx <Input   id="confirmPassword"   name="confirmPassword"   type="password"   autoComplete="new-password"   required ...

### LOW: `contest-full-lifecycle.spec.ts` leaves all DB records behind on every run

- **Flagged by:** qa-tester
- **Location(s):** `tests/e2e/contest-full-lifecycle.spec.ts:297–302`
- **Details:** **Severity:** High | **Confidence:** CONFIRMED  **File:** `tests/e2e/contest-full-lifecycle.spec.ts:297–302`   **Failure scenario:** Step 36 (cleanup) executes `await adminPage?.close()` only. It does not delete the student user (`student-{suffix}`), group, IOI assignment, ICPC assignment, two problems, enrollments, submissions, exam sessions, or anti-cheat events created across Steps 2–32. Every local test run permanently pollutes the DB. After dozens of CI runs, `SELECT COUNT(*) FROM users ...

### LOW: `contest-participant-audit.spec.ts` silently skips on any missing live data

- **Flagged by:** qa-tester
- **Location(s):** `tests/e2e/contest-participant-audit.spec.ts:43–101`
- **Details:** **Severity:** Medium | **Confidence:** CONFIRMED  **File:** `tests/e2e/contest-participant-audit.spec.ts:43–101`   **Failure scenario:** Both tests check `if (!isVisible) { test.skip(true, ...); return }` for: no contests, no submissions tab, no participant links. On a freshly deployed environment (no pre-existing contest data), both tests call `test.skip()` and report as skipped. CI treats skips as success; the participant audit page regression is silently unguarded.  **Root cause:** Tests d...

### LOW: `contest-status-board.spec.ts` inserts student rows without `passwordHash`

- **Flagged by:** qa-tester
- **Location(s):** `tests/e2e/contest-status-board.spec.ts:57–77`
- **Details:** **Severity:** Low | **Confidence:** CONFIRMED  **File:** `tests/e2e/contest-status-board.spec.ts:57–77`   **Failure scenario:** Two student users are inserted with `db.insert(users).values([{ ... }])` with no `passwordHash` field. The column is nullable in the schema (`text("password_hash")`), so the insert succeeds. However, if any auth middleware changes to require a non-null hash for active users, these fixture users would cause the contest-board data load to fail in unexpected ways. Addit...

### LOW: `contextmenu` flagged without explanation.

- **Flagged by:** applicant-reviewer
- **Details:** ---

### LOW: `data-retention.ts`: `parseRetentionOverride()` invalid env values produce silent fallback — untested

- **Flagged by:** test-engineer
- **Details:** **File:** `src/lib/data-retention.ts` **Confidence:** PLAUSIBLE  `parseRetentionOverride` is module-private and falls back to defaults when env values are `NaN` or `<= 0`. Tests in `tests/unit/data-retention.test.ts` cover pruning logic but do not exercise the parsing path with invalid values:  - `AUDIT_EVENT_RETENTION_DAYS="not-a-number"` → should use default 90; untested - `AUDIT_EVENT_RETENTION_DAYS="-5"` → should use default 90; untested - `AUDIT_EVENT_RETENTION_DAYS="0"` → should use def...

### LOW: `defaultLanguage` is a free-text input (`create-problem-form.tsx:918–926`) with no validation. A typo (`pyhon`) silently produces an invalid default; the student sees no language pre-selected and no error.

- **Flagged by:** instructor-reviewer
- **Details:** - **Suggested fix:** Replace with a validated dropdown populated from the active language list. - **Severity:** LOW | **Confidence:** HIGH  ---

### LOW: `docker/Dockerfile.judge-simula` orphan — no language config, no type entry, no docs mention

- **Flagged by:** document-specialist
- **Details:** **Files:** - `docker/Dockerfile.judge-simula`: exists in the `docker/` directory - `src/types/index.ts`: no `simula` in `Language` union - `src/lib/judge/languages.ts`: no `simula` entry - `AGENTS.md`, `docs/languages.md`, `README.md`: no mention of `simula` anywhere  **Failure scenario:** A developer scanning `docker/` for the set of supported languages would find `Dockerfile.judge-simula` and incorrectly conclude `simula` is a supported language. Following the "Adding a New Language" checkl...

### LOW: `function-judging.spec.ts` has no `try/finally`; cleanup only runs if prior steps succeed

- **Flagged by:** qa-tester
- **Details:** **Severity:** Medium | **Confidence:** CONFIRMED  **File:** `tests/e2e/function-judging.spec.ts` (serial steps 1–6; cleanup is Step 6)   **Failure scenario:** If any step between problem creation (Step 2) and the final cleanup step (Step 6) throws, the problem is never deleted via `DELETE /api/v1/problems/${problemId}?force=true`. Over repeated CI runs with worker failures or network timeouts, orphan `[E2E] twoSum Function {suffix}` problems accumulate.  **Suggested fix:** Wrap the problem li...

### LOW: `getDbNowMs()` DB round-trip on every leaderboard request even with warm cache

- **Flagged by:** perf-reviewer
- **Location(s):** `src/lib/assignments/leaderboard.ts:61`
- **Details:** **Severity:** HIGH | **Confidence:** CONFIRMED **File:** `src/lib/assignments/leaderboard.ts:61`  ```ts export async function computeLeaderboard(assignmentId, isInstructorView) {   const meta = await rawQueryOne<AssignmentFreezeRow>(     `SELECT freeze_leaderboard_at, scoring_model, starts_at, deadline, late_deadline      FROM assignments WHERE id = @assignmentId`, { assignmentId }   );   // ...   const nowMs = await getDbNowMs();   // separate DB round-trip, always ```  `computeLeaderboard` ...

### LOW: `getLeaderboardProblems()` not cached on every leaderboard request

- **Flagged by:** perf-reviewer
- **Location(s):** `src/lib/assignments/leaderboard.ts:21`
- **Details:** **Severity:** MEDIUM | **Confidence:** CONFIRMED **File:** `src/lib/assignments/leaderboard.ts:21`, leaderboard route  ```ts // leaderboard route handler, every GET: const problems = await getLeaderboardProblems(assignmentId);   // DB query, no cache const leaderboard = await computeLeaderboard(assignmentId, isInstructorView); ```  The assignment's problem list (title, points, sort order) never changes during a running contest. Yet `getLeaderboardProblems` issues a fresh SQL join on every req...

### LOW: `invalidateRankingCache` O(n) LRU scan on every judge verdict

- **Flagged by:** perf-reviewer
- **Location(s):** `src/lib/assignments/contest-scoring.ts:56`
- **Details:** **Severity:** LOW | **Confidence:** CONFIRMED **File:** `src/lib/assignments/contest-scoring.ts:56`  ```ts for (const key of rankingCache.keys()) {   if (key.startsWith(`${assignmentId}:`)) rankingCache.delete(key); } ```  O(n) iteration of the LRU (max=50) on every final verdict to find frozen-variant keys. Also iterates `_refreshingKeys` (a Set) and `_lastRefreshFailureAt` (a Map) with the same pattern. Not a current bottleneck at max=50, but will bite if the LRU max is raised for multi-con...

### LOW: `locale-cookie-respected.spec.ts` does not assert `Vary: Cookie` in e2e layer; regression can slip through

- **Flagged by:** qa-tester
- **Location(s):** `tests/e2e/locale-cookie-respected.spec.ts:46–54`
- **Details:** **Severity:** Low | **Confidence:** PLAUSIBLE  **File:** `tests/e2e/locale-cookie-respected.spec.ts:46–54`   **Failure scenario:** The spec's inline comment explicitly says "Vary: Cookie is asserted at the proxy unit-test layer." If the middleware changes (new Next.js version, RSC rewrite) and the `Vary` header is dropped or changed, content negotiation caches could serve the wrong locale to all users. The proxy unit test (`tests/unit/proxy.test.ts`) checks the header in isolation, but the e2...

### LOW: `mobile-layout.spec.ts` hardcodes admin credentials instead of using `DEFAULT_CREDENTIALS`

- **Flagged by:** qa-tester
- **Location(s):** `tests/e2e/mobile-layout.spec.ts:33, 38–40`, `tests/e2e/contest-status-board.spec.ts:18–19`
- **Details:** **Severity:** Medium | **Confidence:** CONFIRMED  **File:** `tests/e2e/mobile-layout.spec.ts:33, 38–40`   **Failure scenario:** The helper `loginAsSeededAdmin` fills `#password` with literal `"admin123"` and on first-login change sets `"AdminPass234"`. If the E2E environment uses `E2E_PASSWORD` with a different value (or if the seeded admin has already been migrated to a different password), every mobile-layout test fails with "Login failed" or stays on the change-password page forever (15s t...

### LOW: `next-auth` pinned to `5.0.0-beta.31` (pre-release)

- **Flagged by:** architect
- **Location(s):** `package.json:58`
- **Details:** **File:** `package.json:58`  ```json "next-auth": "5.0.0-beta.31", ```  **Observation:**   NextAuth v5 is pinned to a specific beta. Pre-release packages do not follow semantic versioning guarantees; breaking changes can appear in any beta increment without a major version bump. The `next-auth@^5.0.0-beta.31` range (without `^`) avoids accidental upgrades, which is correct defensive pinning. However, the underlying risk is that beta.31 may have known security vulnerabilities addressed in late...

### LOW: `recruiting-invitation.spec.ts` does not clean up created group, problems, or assignment

- **Flagged by:** qa-tester
- **Details:** **Severity:** Medium | **Confidence:** CONFIRMED  **File:** `tests/e2e/recruiting-invitation.spec.ts` (end of test, line ~115)   **Failure scenario:** The test creates: a group, two problems (one allowed, one blocked), and an assignment. After the assertion sequence, `candidateContext.close()` is called but no API DELETE calls clean up the group, problems, or assignment. These accumulate on shared test environments.  **Suggested fix:** Add `try/finally` cleanup: ```ts } finally {   await admi...

### LOW: `remediation.smoke.spec.ts` name misleadingly implies it runs in the smoke profile

- **Flagged by:** qa-tester
- **Location(s):** `tests/e2e/remediation.smoke.spec.ts:1`, `playwright.config.ts:26–47`
- **Details:** **Severity:** Low | **Confidence:** CONFIRMED  **File:** `tests/e2e/remediation.smoke.spec.ts:1`, `playwright.config.ts:26–47`   **Failure scenario:** The file is named `remediation.smoke.spec.ts` but is excluded from `remoteSafeSpecsWithAuth`. It directly imports `{ db } from "@/lib/db"` and requires local DB access, making it local-only. Any developer who reads "smoke" in the filename and expects it to run in post-deploy checks will be mistaken — the spec is a full-profile local-only test. ...

### LOW: `signOut` race on start.

- **Flagged by:** applicant-reviewer
- **Details:** ---

### LOW: `student-submission-flow.spec.ts` Step 3 does not verify the `mustChangePassword` PATCH succeeded

- **Flagged by:** qa-tester
- **Location(s):** `tests/e2e/student-submission-flow.spec.ts:118–124`
- **Details:** **Severity:** Low | **Confidence:** CONFIRMED  **File:** `tests/e2e/student-submission-flow.spec.ts:118–124`   **Failure scenario:** The PATCH to `/api/v1/users/${studentUserId}` sets `mustChangePassword: false`. The response is not checked. If the PATCH silently fails (permission issue, network blip), Step 4 (student login) hits `/change-password` and Step 4 throws `"Unexpected forced password change for student-sub-..."` because `allowPasswordChange: false`. The root cause (PATCH failure) i...

### LOW: `student-submission-flow.spec.ts` silently treats a submission failure (409) as a passing outcome

- **Flagged by:** qa-tester
- **Location(s):** `tests/e2e/student-submission-flow.spec.ts:163–175`
- **Details:** **Severity:** High | **Confidence:** CONFIRMED  **File:** `tests/e2e/student-submission-flow.spec.ts:163–175`   **Failure scenario:** Step 7 ("Student submits solution via API") posts to `/api/v1/submissions`. When the problem has no assignment context, the API correctly returns `409 assignmentContextRequired`. The test then accepts this with `expect([200, 201, 409]).toContain(res.status())` and returns early without setting `submissionId`. As a result, Steps 8 ("Poll submission until judged"...

### LOW: crun/OCI runtime no checksum

- **Flagged by:** security-analyzer

### LOW: docs/languages.md amd64/arm64 E2E summary (line 198) refers to 113 languages — stale against 125-language reality

- **Flagged by:** document-specialist
- **Details:** **Files:** - `docs/languages.md` lines 194–204: "amd64 E2E Summary (2026-03-29): **113 of 113 languages pass** on amd64" and "arm64 E2E Summary (2026-03-29): **112 of 113 languages pass** on arm64" - The active language count is now 125  **Failure scenario:** An agent or contributor reading the E2E summary section concludes the total test scope is 113 languages. They may not run E2E for the 12 languages added after 2026-03-29. The outdated totals also undercount the number of languages that n...

### LOW: nginx config regenerated on every deploy, operator customisations lost.

- **Flagged by:** admin-reviewer
- **Location(s):** `deploy-docker.sh:884-1057`
- **Details:** `deploy-docker.sh:884-1057` overwrites `/etc/nginx/sites-available/judgekit` in full on every deploy. Any operator adjustment (rate-limit burst tuning, temporary IP block, maintenance page) is silently lost on the next deploy. - Fix: before regenerating, `remote_sudo "cp /etc/nginx/sites-available/judgekit /etc/nginx/sites-available/judgekit.bak.$(date +%s)"` with a 5-copy rotation.

### LOW: npm audit: 2 moderate-severity dependency vulnerabilities

- **Flagged by:** security-reviewer
- **Details:** **Severity:** LOW   **Category:** A06 Vulnerable and Outdated Components   **Location:** `package.json` / `node_modules`   **Exploitability:** Depends on specific CVE; neither is high/critical    **Issue:** `npm audit` reports 2 moderate vulnerabilities. Neither is high/critical, but they should be reviewed and resolved.  **Fix:** Run `npm audit fix` or check `npm audit --json` for specifics and patch or pin affected packages.  ---

### LOW: src/components/assignment/assignment-overview.tsx:227

- **Flagged by:** student-reviewer
- **Details:** Late penalty renders as `{assignment.latePenalty ?? 0}%`. If the instructor never configured it, the student sees "0%" implying no penalty when the actual policy was simply not set. Better: show "-" or "Not configured" when the value is null.  ---

### LOW: src/components/exam/countdown-timer.tsx:224

- **Flagged by:** student-reviewer
- **Details:** The timer renders inside a small `<Badge>` inline in the page flow. On a long problem statement the badge can scroll off-screen. Under exam stress I want the timer pinned somewhere permanent (sticky header or floating chip), not buried in the content flow.  ---

### LOW: ~30+ source-scanning tests assert string presence instead of runtime behavior

- **Flagged by:** test-engineer
- **Details:** **Files:** `tests/unit/proxy-error-handling.test.ts`, `tests/unit/auth/login-rate-limit-order.test.ts`, `tests/unit/auth/rate-limit-await.test.ts`, `tests/unit/auto-review-implementation.test.ts`, `tests/unit/discussions-reply-count-implementation.test.ts`, `tests/unit/participant-audit-page-implementation.test.ts`, `tests/unit/submission-detail-time-limit-implementation.test.ts`, `tests/unit/problem-duplicate-implementation.test.ts`, `tests/unit/public-user-stats-implementation.test.ts`, and...

## Risks Needing Manual Validation

- **LOW** — Shell command validation bypassed when Rust runner is configured (security-reviewer)
- **HIGH** — Browser crash or accidental close loses in-progress code. (applicant-reviewer)
- **HIGH** — Container logs unbounded — disk fill confirmed risk. (admin-reviewer)
- **HIGH** — No "test your editor" before start. (applicant-reviewer)
- **HIGH** — No TA workload metrics anywhere. (assistant-reviewer)
- **HIGH** — No contest-mode preflight checklist or script. (admin-reviewer)
- **HIGH** — No documented secret rotation procedure for any of the 7 key types. (admin-reviewer)
- **HIGH** — No in-platform DM system. (assistant-reviewer)
- **HIGH** — No problem statement version history. As an instructor I cannot see what a problem said before I edited it, and students in a live homework window see the new text with no change notice. If I find a typo mid-deadline and fix it, there is no audit of what changed. (instructor-reviewer)
- **HIGH** — No regrade request model, API route, or UI. (assistant-reviewer)
- **HIGH** — No self-service data export for candidates or students. (admin-reviewer)
- **HIGH** — No side-by-side code diff for similarity hits. (assistant-reviewer)
- **HIGH** — No visible "your code is being autosaved" indicator. (applicant-reviewer)
- **HIGH** — No workload counter or grading triage view. (assistant-reviewer)
- **HIGH** — Similarity check is hardcoded contest-only and returns 404 for regular homework. `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:18`: (instructor-reviewer)
- **HIGH** — `flix` Docker image documented as `judge-jvm`; actual image is `judge-flix` (document-specialist)
- **HIGH** — `j` and `malbolge` appear in README Docker image size table but have no language config anywhere (document-specialist)
- **HIGH** — `roc` in AGENTS.md language table (row 94) but absent from the `Language` type union (document-specialist)
- **HIGH** — `stop_grace_period` not set in `docker-compose.production.yml`. (admin-reviewer)

## Agent Failures

No agent files were skipped; all registered and fallback reviewers produced review content.
