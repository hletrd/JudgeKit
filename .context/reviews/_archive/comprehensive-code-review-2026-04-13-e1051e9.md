# Comprehensive code review — 2026-04-13 (`e1051e9`)

## Scope and inventory

This review was performed against the current tracked repository at commit `e1051e9`.

### Inventory first
I built an inventory of tracked, review-relevant files before looking for findings, excluding generated/runtime/vendor artifacts such as `.git/`, `node_modules/`, `.next/`, `coverage/`, `test-results/`, `data/`, `.omx/`, `.omc/`, Rust `target/`, and local scratch trees like `scripts/worv-problems/`.

Tracked review surface inventoried:
- `src/`: **427** files
- `tests/`: **225** files
- `docker/`: **102** files
- `drizzle/`: **53** files
- `static-site/`: **54** files
- `docs/`: **17** files
- `scripts/`: **21** files
- `.context/`: **30** files
- `judge-worker-rs/`: **11** tracked source/config files
- `rate-limiter-rs/`: **4** tracked source/config files
- `code-similarity-rs/`: **4** tracked source/config files
- root configs / compose / Dockerfiles / README / messages / Vitest / Playwright / TS configs: **27** files

Total tracked review-relevant files inventoried: **1000**.

### Review method
I did not sample just a few files. I combined:
- root-level config/deploy/doc review (`README.md`, deployment and worker docs, compose files, Dockerfiles, env examples)
- subsystem inspection across app routes, server utilities, UI components, Rust worker/runner, sidecars, scripts, and tests
- repository-wide sweeps for common missed-issue patterns: role hard-coding, contest/anti-cheat paths, `SelectValue` usage, access-code handling, cross-route authorization mismatches, and chat/context scoping
- cross-file validation of UI ↔ API ↔ server logic, docs ↔ runtime, and app ↔ worker interactions

### Documentation reviewed
I specifically reviewed:
- `README.md`
- `docs/deployment.md`
- `docs/judge-workers.md`
- `docs/exam-integrity-model.md`
- supporting in-repo docs/config referenced by those runtime surfaces

### Final sweep focus
After the main pass I did a dedicated missed-issues sweep for:
- anti-cheat capture vs actual contestant navigation paths
- residual built-in-role assumptions after custom-role support additions
- access-code data integrity / collision handling
- lecture-mode UI wiring
- `SelectValue` / dropdown rendering pitfalls
- analytics/export permission consistency
- assistant context scoping for reused problems

---

## Executive summary

I did **not** find a new RCE-class critical issue in the current head, but I did find several real correctness, security, and maintainability problems that are still present in the shipped code.

### Severity summary
- **HIGH:** 3
- **MEDIUM:** 5
- **LIKELY / needs manual validation:** 1

### Status summary
- **Confirmed issues:** 8
- **Likely issues:** 1
- **Risks needing separate manual validation:** 0 beyond the one likely issue below

---

## Findings

### HIGH 1 — Anti-cheat monitoring is mounted on the contest landing page, not on the actual problem-solving page
**Status:** Confirmed  
**Confidence:** High

**Files / regions**
- `src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx:269-274`
- `src/app/(dashboard)/dashboard/problems/[id]/page.tsx:209-366`
- `src/components/exam/anti-cheat-monitor.tsx:47-200`
- `docs/exam-integrity-model.md:6-17`

**Why this is a problem**
The browser-side anti-cheat telemetry is only mounted from the contest overview page. Contestants do the actual work on `/dashboard/problems/[id]?assignmentId=...`, and that page never mounts `AntiCheatMonitor` at all.

So the repository documents and markets focus/copy/paste telemetry as a current capability, but in the main user journey the monitor disappears as soon as the contestant opens the actual problem page.

**Concrete failure scenario**
1. A contestant enters a contest from `/dashboard/contests/[assignmentId]`.
2. The overview page mounts `AntiCheatMonitor`.
3. The contestant clicks into `/dashboard/problems/[id]?assignmentId=...` and spends the rest of the contest in the editor/problem page.
4. No copy/paste/tab-switch/context-menu telemetry is captured from the page where the work actually happens.
5. The anti-cheat dashboard looks empty or nearly empty even though the feature is supposedly enabled.

**Suggested fix**
- Mount `AntiCheatMonitor` on the problem-solving page whenever `assignmentContext` is present and anti-cheat is enabled for that assignment.
- Alternatively, move the monitor to a layout-level contest scope keyed by `assignmentId`, so navigation from contest page → problem page does not disable telemetry.
- Add an end-to-end test that opens a contest problem page, triggers copy/tab-switch/blur events there, and verifies the events appear through `/api/v1/contests/[assignmentId]/anti-cheat`.

**Test gap**
Current tests cover the anti-cheat API and dashboard, but I found no test that verifies telemetry from the actual contest problem/editor page.

---

### HIGH 2 — The student-facing anti-cheat POST endpoint accepts privileged/internal event types that contestants can forge
**Status:** Confirmed  
**Confidence:** High

**Files / regions**
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:18-31`
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:34-125`

**Why this is a problem**
The route comment explicitly says this POST endpoint is **student-facing**, but the accepted `eventType` enum includes:
- `ip_change`
- `code_similarity`
- `heartbeat`

The route then inserts any accepted event type directly into `anti_cheat_events` without distinguishing between client-originated telemetry and server/system-originated evidence.

That means an enrolled participant can fabricate escalation-level events that were clearly meant to be generated by trusted backend logic.

**Concrete failure scenario**
1. A contestant opens DevTools or scripts the endpoint directly.
2. They POST `{ eventType: "code_similarity", details: "..." }` or `{ eventType: "ip_change", ... }`.
3. The event is stored as if it were a genuine system-detected anomaly.
4. The anti-cheat dashboard now shows red/high-review signals that were entirely contestant-forged.

**Suggested fix**
- Split event types into two classes:
  - **client-allowed:** `tab_switch`, `copy`, `paste`, `blur`, `contextmenu`, `heartbeat`
  - **server-only/internal:** `ip_change`, `code_similarity`
- Reject server-only event types from this public endpoint.
- Better: use a separate internal-only insertion path for backend-generated anti-cheat events.

**Test gap**
I found no test asserting that contestants are blocked from posting privileged event types.

---

### HIGH 3 — Residual built-in-`student` branches still let custom learner roles bypass assignment-context enforcement
**Status:** Confirmed  
**Confidence:** High

**Files / regions**
- `src/app/(dashboard)/dashboard/problems/[id]/page.tsx:191-201`
- `src/app/api/v1/submissions/route.ts:177-183`
- `src/app/api/v1/code-snapshots/route.ts:24-34`
- `src/components/layout/app-sidebar.tsx:174-195`
- `src/types/index.ts:1-8`

**Why this is a problem**
The repo clearly supports custom roles at runtime, but several important learner-path checks still key off `user.role === "student"` instead of capability/intent.

That has two effects:
1. **Custom learner roles** skip the assignment-context chooser/guard on the problem page.
2. The submission and code-snapshot routes skip the `assignmentContextRequired` gate for those same users.

So a custom role that is meant to behave like a learner can submit code without an assignment context, which bypasses contest/homework-specific validation paths (exam window checks, deadline enforcement, contest submission scoping, etc.).

**Concrete failure scenario**
1. Admin creates a custom learner-like role (for example, limited candidate/test-taker role with basic problem access).
2. The user is enrolled in a contest/homework group and can access the problem.
3. They POST `/api/v1/submissions` without `assignmentId`.
4. Because the route only forces assignment context for the literal built-in role `student`, the submission goes through the generic problem-access path instead of `validateAssignmentSubmission(...)`.
5. Contest/homework restrictions that should have been enforced by assignment context are skipped.

**Suggested fix**
- Replace built-in-string learner checks with capability- or policy-driven checks.
- If the rule is “users without elevated management/view-all capabilities must provide assignment context when one exists,” encode that directly instead of checking for `student`.
- Apply the same policy consistently to:
  - problem-page assignment choice logic,
  - submission creation,
  - code-snapshot creation,
  - sidebar/platform-mode hiding logic.

**Test gap**
I found no end-to-end custom-role test covering learner submissions with active assignment/contest context.

---

### MEDIUM 1 — Contest access codes are not unique, so a collision can redeem the wrong contest
**Status:** Confirmed  
**Confidence:** High

**Files / regions**
- `src/lib/assignments/access-codes.ts:12-34`
- `src/lib/assignments/access-codes.ts:77-91`
- `src/lib/db/schema.pg.ts:334-350`

**Why this is a problem**
`generateAccessCode()` produces an 8-character random code, but `assignments.access_code` only has a normal index, not a unique constraint. `redeemAccessCode()` looks up the assignment by `accessCode` and takes the first match.

This creates a data-integrity hole:
- random collisions are rare, but possible;
- manually supplied codes (`setAccessCode(assignmentId, code)`) can collide immediately;
- when collisions happen, contest join becomes nondeterministic or outright wrong.

**Concrete failure scenario**
1. Two contests end up sharing the same access code (either by collision or admin-chosen duplicate code).
2. A contestant enters that code in the join form.
3. `redeemAccessCode()` does `where(eq(assignments.accessCode, normalizedCode)).limit(1)`.
4. The user is enrolled into whichever assignment the DB happens to return first, not necessarily the intended one.

**Suggested fix**
- Add a **unique constraint/index** on `assignments.access_code`.
- Make `setAccessCode()` retry on conflict when generating random codes.
- Reject manually supplied duplicate codes with an explicit error.
- Add a DB-backed test for duplicate-code rejection.

---

### MEDIUM 2 — Rejoining via an existing contest access token does not repair a missing enrollment row
**Status:** Confirmed  
**Confidence:** High

**Files / regions**
- `src/lib/assignments/access-codes.ts:108-122`
- `src/lib/assignments/access-codes.ts:134-152`

**Why this is a problem**
If `contest_access_tokens` already contains a row for `(assignmentId, userId)`, `redeemAccessCode()` returns early with `alreadyEnrolled: true` **before** checking or repairing the user’s `enrollments` row.

But the actual access model depends on both:
- contest access token for contest join tracking,
- group enrollment for broader group/problem access.

Once those drift apart, re-entering the access code cannot repair the broken state.

**Concrete failure scenario**
1. A user joins a contest successfully.
2. Later, the `enrollments` row is removed (manual cleanup, partial restore, admin removal, failed migration, etc.), but `contest_access_tokens` remains.
3. The user tries to join again with the access code.
4. The route returns `alreadyEnrolled: true` and exits early.
5. The user still lacks group enrollment and remains unable to access the contest/group resources correctly.

**Suggested fix**
- On the “existing token” path, verify the enrollment exists and recreate it if missing before returning success.
- Consider renaming the boolean in the response to something like `alreadyRedeemed` if that is what it actually means.
- Add an integration test covering “token exists, enrollment missing”.

---

### MEDIUM 3 — Analytics/export authorization is inconsistent with the page-level authorization model
**Status:** Confirmed  
**Confidence:** High

**Files / regions**
- `src/app/(dashboard)/dashboard/contests/[assignmentId]/analytics/page.tsx:38-41`
- `src/lib/assignments/submissions.ts:279-318`
- `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:33-45`
- `src/app/api/v1/contests/[assignmentId]/export/route.ts:59-67`

**Why this is a problem**
The analytics page allows access via `canViewAssignmentSubmissions(...)`, which is capability-aware and supports custom roles such as `assignments.view_status` / `submissions.view_all`.

But the underlying analytics and export APIs use `canManageContest(...)`, which is management-only.

So the page shell can load for some authorized roles, while the API it depends on still responds `403 Forbidden`.

**Concrete failure scenario**
1. A custom reviewer/TA role has assignment-status visibility but is not a contest manager.
2. They can reach `/dashboard/contests/[assignmentId]/analytics` because the page uses `canViewAssignmentSubmissions(...)`.
3. `AnalyticsCharts` or `ExportButton` calls the API.
4. The API route checks `canManageContest(...)` and returns `403`.
5. The page is visible but the actual data/export actions fail.

**Suggested fix**
- Align the APIs with the same helper/policy used by the page, or
- split “view analytics/export” and “manage contest” into clearly separate authorization paths and use them consistently everywhere.
- Add role-matrix tests for custom analytics/export capabilities.

---

### MEDIUM 4 — Lecture-mode submission stats are effectively dead code, and their data source would be misleading even if the panel were reachable
**Status:** Confirmed  
**Confidence:** High

**Files / regions**
- `src/app/(dashboard)/layout.tsx:92-94`
- `src/components/lecture/lecture-toolbar.tsx:153-156`
- `src/app/(dashboard)/dashboard/problems/[id]/problem-lecture-wrapper.tsx:21-39`
- `src/components/lecture/submission-overview.tsx:61-81`

**Why this is a problem**
There are two separate issues here:

1. **The panel is not wired up.**
   - `ProblemLectureWrapper` owns `showStats` state.
   - `LectureToolbar` only renders the stats button if it receives `onToggleStats`.
   - The app layout renders `<LectureToolbar />` globally with no `onToggleStats` prop.
   - Therefore the stats panel never becomes open from the actual lecture UI.

2. **The data source is wrong even if someone wires it later.**
   - `SubmissionOverview` fetches `/api/v1/submissions?problemId=...&limit=100`.
   - It does not scope by `assignmentId`.
   - It computes “accepted % / recent submissions” from only the latest 100 rows.

So this feature is currently unreachable, and if re-enabled it would still mix unrelated practice/assignment/contest submissions and truncate counts.

**Concrete failure scenario**
- The UI advertises a lecture-mode stats button/hotkey path, but instructors cannot actually open the stats panel from the mounted toolbar.
- If a future refactor wires the button without fixing the query, stats for a contest problem will silently include old submissions from other assignments or practice runs and will undercount after 100 rows.

**Suggested fix**
- Thread `onToggleStats` from the problem lecture wrapper into the mounted toolbar (or move the toolbar into the wrapper so they share state).
- Change the stats query to use `assignmentId` when present.
- Use a proper aggregate endpoint instead of “latest 100 submissions” if the panel is meant to show actual totals.
- Add a component test for the stats toggle and an integration test for assignment-scoped stats.

---

### MEDIUM 5 — The chat-widget “submission history” tool ignores assignment context, so reused problems mix unrelated submission histories
**Status:** Confirmed  
**Confidence:** High

**Files / regions**
- `src/lib/plugins/chat-widget/chat-widget.tsx:152-163`
- `src/lib/plugins/chat-widget/tools.ts:30-39`
- `src/lib/plugins/chat-widget/tools.ts:116-149`

**Why this is a problem**
The client sends `assignmentId` in the tool context, but `get_submission_history` ignores it and fetches all submissions for `(userId, problemId)` across every assignment/practice context.

That breaks correctness whenever the same problem is reused across:
- practice and contest,
- multiple assignments,
- old and current course runs.

The AI assistant then reasons over a blended history that may not match the current assessment.

**Concrete failure scenario**
1. A problem is reused in a live contest after students practiced it earlier.
2. The student opens the chat widget during the contest.
3. The widget sends `assignmentId`, but `handleGetSubmissionHistory()` ignores it.
4. The assistant sees the student’s old accepted practice submission history alongside current contest submissions.
5. The assistant’s diagnosis or hints are based on the wrong context and may incorrectly imply prior success/failure in the active contest.

**Suggested fix**
- When `context.assignmentId` is present, filter submission history by both `problemId` **and** `assignmentId`.
- Only fall back to problem-wide history when there is truly no assignment context.
- Add a test that reuses the same problem across two assignments and verifies the tool returns only the active assignment’s submissions.

---

### LIKELY 1 — Several current `SelectValue` call sites still violate the project’s select contract and are likely to render raw IDs/keys or break under Turbopack
**Status:** Likely issue  
**Confidence:** Medium

**Files / regions (examples)**
- `src/components/ui/select.tsx:18-24,97-120`
- `src/components/contest/code-timeline-panel.tsx:93-100`
- `src/components/contest/recruiting-invitations-panel.tsx:280-288`
- `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:261-268`
- `src/app/(dashboard)/dashboard/problem-sets/_components/problem-set-form.tsx:288`

**Why this is likely a problem**
The in-repo select wrapper is built on Base UI and the surrounding project conventions clearly expect:
- `SelectItem` to provide a label,
- `SelectValue` to render the selected label via stable/static children.

Several current call sites still do one of the known-bad patterns:
- empty `<SelectValue />`, which tends to surface the raw `value` (IDs/status keys), or
- complex dynamic/IIFE children, which are fragile under Turbopack parsing/rendering.

**Concrete failure scenarios**
- The code timeline filter can show a raw problem ID instead of the problem title.
- The recruiting invitations status filter can display the raw enum key rather than the localized label.
- The group member picker uses an inline IIFE inside `SelectValue`, which is exactly the sort of construct that tends to produce Turbopack/react rendering problems.

**Suggested fix**
- Normalize all select call sites to the same pattern:
  - compute the selected label in a simple variable/state expression,
  - render `<SelectValue>{selectedLabel}</SelectValue>`,
  - never leave `SelectValue` empty when a human-readable label is expected.
- Add a repo-wide implementation test for select contract compliance, similar to the existing i18n implementation guards.

---

## Additional observations

These were not elevated to full findings, but they are worth keeping in mind:
- The anti-cheat route currently double-wraps structured detail payloads into JSON strings (`details: JSON.stringify({ message: rawDetails })`), which makes stored telemetry less clean than it needs to be.
- The `anonymous_leaderboard` flag exists in schema but appears to have no effect in the current leaderboard route because non-instructors are anonymized for every contest by default. This looks incomplete, but I did not promote it because the intended product behavior is not explicitly documented in the repo.

---

## Final missed-issues sweep

I did a final sweep for commonly missed classes of issues and confirmed the following coverage:
- **Role/capability drift:** checked remaining built-in role branches against capability-aware helpers.
- **Telemetry path coverage:** checked where the anti-cheat client is actually mounted, not just whether the endpoint exists.
- **UI framework contract violations:** swept all `SelectValue` call sites, not just one component.
- **Cross-route permission mismatches:** compared page-level gating with the APIs they call.
- **Data integrity:** checked schema constraints against lookup semantics (`access_code`, contest access repair path).
- **Assistant context correctness:** checked chat widget tool queries against the context the UI actually sends.

I did not find evidence that a major review-relevant subsystem was skipped. The review touched root config/docs, API routes, shared auth/capability/db helpers, the Rust worker/runner and sidecars, UI components, deployment scripts, and the corresponding tests.

---

## Recommended priority order

1. **Fix anti-cheat capture placement** on the real problem-solving page.
2. **Lock down the anti-cheat POST schema** so contestants cannot forge `code_similarity` / `ip_change` events.
3. **Repair custom-role learner flows** that still bypass assignment-context enforcement.
4. **Make contest access codes unique** and repair the existing-token enrollment path.
5. **Unify contest analytics/export authorization** with the page-level policy.
6. **Either wire or remove the lecture submission-stats feature**, then scope its data correctly.
7. **Scope chat-widget submission history by assignment** when context exists.
8. **Normalize all `SelectValue` usages** to the supported pattern.
