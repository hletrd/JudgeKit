# JudgeKit — Assistant (TA) Role Review & Least-Privilege RBAC Audit

**Reviewer perspective:** the `assistant` (TA) role, plus a least-privilege RBAC auditor.
**Date:** 2026-05-30
**Scope:** `src/lib/capabilities/**`, `src/lib/auth/**`, `src/lib/assignments/**`, `src/app/api/v1/**`.
**Method:** traced each capability from definition (`defaults.ts`) → checker (`checker.ts`/`cache.ts`) → actual route enforcement. Distinguished confirmed (code-read) from suspected.

---

## TL;DR

The capability model is genuinely capability-based and **enforced server-side** (not just UI-hidden): `createApiHandler` runs `auth.capabilities` checks before the handler, and routes additionally call object-level helpers (`canAccessSubmission`, `canViewAssignmentSubmissions`, `canManageGroupResourcesAsync`). User/role/system management, score overrides, grade export, and hidden test-case access are all correctly **out of reach** for the assistant. Submission detail/comment/rejudge are correctly **group-scoped** for the assistant via `canViewAssignmentSubmissions` → `hasGroupInstructorRole`.

The problems are concentrated in **two global, un-scoped capabilities** the built-in assistant holds:

1. **`problems.view_all`** lets an assistant read the full statement of EVERY problem in the system — including `hidden`/`private` exam & recruiting problems belonging to groups they are not assigned to, before those exams open. (Confirmed.)
2. **`anti_cheat.view_events`** is treated as a GLOBAL grant inside `canMonitorContest`, so an assistant can pull anti-cheat event logs (IP addresses, user agents, tab-switch/paste timelines) for ANY contest in ANY group, not just groups they teach. (Confirmed.)

Plus one **dead/under-privileged capability**: the assistant holds `anti_cheat.run_similarity` but the only route that runs similarity (`similarity-check`) gates on `canManageContest`, which excludes TAs — so the capability does nothing. (Confirmed.)

And the headline TA-workflow gap: there is **no group-scoped submission LIST API** — `GET /api/v1/submissions` is a binary "all-or-own" filter, so an assistant can only review students through SSR pages / per-assignment endpoints, never the generic list. (Confirmed; usability, not a leak.)

---

## Top risks for production use (ranked)

| # | Risk | Severity | Confidence | Type |
|---|------|----------|-----------|------|
| 1 | Assistant can read every problem statement system-wide, incl. hidden/private exam & recruiting problems in groups they don't teach (`problems.view_all` is global, not group-scoped) — pre-exam leakage | High | Confirmed | Over-privilege / missing object-level authz |
| 2 | Assistant can view anti-cheat event logs (IP, UA, behavioral timeline) for ANY contest in ANY group via global `anti_cheat.view_events` bypass in `canMonitorContest` | High | Confirmed | Over-privilege / cross-group (function-level vs object-level) |
| 3 | `anti_cheat.run_similarity` granted to assistant is unusable — `similarity-check` route uses `canManageContest` (TA-excluded). Dead capability → false sense of capability + inconsistency | Medium | Confirmed | Under-privilege / spec drift |
| 4 | No group-scoped submission LIST endpoint: `GET /api/v1/submissions` is all-or-own. TA cannot list their groups' submissions via API; `getSubmissionReviewGroupIds` is only wired into export/bulk-rejudge | Medium | Confirmed | Under-privilege / usability blocker |
| 5 | Inconsistent function-level gating across contest monitoring routes (`analytics` has no capability gate; `code-snapshots`/`participant-timeline` require `contests.view_analytics` which the assistant lacks; `anti-cheat` GET uses the global bypass). Capability surface is incoherent | Medium | Confirmed | Inconsistent enforcement |
| 6 | `assignments.view_status` is global (not bound to assigned groups) — it is what flips `getSubmissionReviewGroupIds`/`canViewAssignmentSubmissions` into "scoped instructor" mode. Scoping then relies on the downstream group check; if any consumer forgets the group check, this cap silently widens. Defense-in-depth concern | Low–Medium | Confirmed (latent) | Scoping fragility |

No confirmed privilege-escalation-to-admin path was found for the assistant. User management, role management, system settings, backups, and grade overrides are all correctly inaccessible.

---

## What the assistant role actually IS

From `src/lib/capabilities/defaults.ts:15-34` (`ASSISTANT_CAPABILITIES`) and `:114-120` (`DEFAULT_ROLE_LEVELS.assistant = 1`):

```
content.submit_solutions      (inherited from student)
content.view_own_submissions  (inherited from student)
submissions.view_source
submissions.comment
submissions.rejudge
assignments.view_status
problems.view_all
anti_cheat.view_events
anti_cheat.run_similarity
files.upload
```

Notably **OMITTED** (good): `submissions.view_all`, `problems.edit/delete/create/manage_visibility`, `groups.*` (incl. `manage_members`, `view_all`), `assignments.create/edit/delete`, `problem_sets.*`, `contests.*` (incl. `view_analytics`, `view_leaderboard_full`, `export`, `manage_access_codes`), `recruiting.manage_invitations`, `community.moderate`, `users.*`, `system.*`, `files.manage`.

The design intent (`defaults.ts:17-25`) is: omit `submissions.view_all` so `getSubmissionReviewGroupIds()` (`src/lib/assignments/submissions.ts:177-191`) restricts the assistant to assigned teaching groups; `assignments.view_status` is the trigger that puts them on the scoped path.

Level 1 (above student 0, below instructor 2). `users/[id]` PATCH/DELETE use `getRoleLevel`/`isSuperAdminRole` for "can't manage same-or-higher level" — but the assistant never reaches those code paths because it lacks `users.edit`/`users.delete`.

---

## Capability matrix for `assistant`

| Capability | Gated action(s) | Enforced where (server-side) | Scope | Verdict |
|------------|-----------------|------------------------------|-------|---------|
| `content.submit_solutions` | Create submission | `POST /api/v1/submissions` (`validateAssignmentSubmission` + `canAccessProblem`) | self | OK |
| `content.view_own_submissions` | View own subs | `GET /api/v1/submissions` (`userFilter`), detail via `canAccessSubmission` | self | OK |
| `submissions.view_source` | See `sourceCode` of others' subs | `sanitizeSubmissionForViewer` `visibility.ts:76,145-147` (after `canAccessSubmission`) | **group-scoped** (gated by `canViewAssignmentSubmissions`) | OK |
| `submissions.comment` | Add review comment | `POST /api/v1/submissions/[id]/comments` `auth.capabilities` + `canAccessSubmission` | group-scoped | OK |
| `submissions.rejudge` | Rejudge a submission | `POST .../[id]/rejudge` (cap + `canAccessSubmission`); bulk `admin/submissions/rejudge` (cap + `getSubmissionReviewGroupIds`) | group-scoped | OK |
| `assignments.view_status` | Flip to "scoped instructor" view of assignment status / submissions / analytics | `getSubmissionReviewGroupIds`, `canViewAssignmentSubmissions`, SSR pages, export | **GLOBAL cap; scoping deferred to downstream group check** | OK but fragile (Risk 6) |
| `problems.view_all` | Read ANY problem (statement) incl. hidden/private | `canAccessProblem` `permissions.ts:112-113`; `GET /api/v1/problems` `:26`; `GET /api/v1/problems/[id]` `:53` | **GLOBAL — no group binding** | **OVER-PRIVILEGE (Risk 1)** |
| `anti_cheat.view_events` | Read anti-cheat event log of a contest | `GET .../anti-cheat` via `canMonitorContest` `contests.ts:241` | **GLOBAL fallback — any group (Risk 2)** | **OVER-PRIVILEGE** |
| `anti_cheat.run_similarity` | Run code-similarity report | `POST .../similarity-check` gates on `canManageContest` (TA-excluded) | n/a | **DEAD CAP (Risk 3)** |
| `files.upload` | Upload files; list/get OWN files | `POST/GET /api/v1/files` (`files.upload`/`files.manage`), `files/[id]` | self (list scoped to `uploadedBy` at `files/route.ts:174-176`) | OK |

Capabilities the assistant does NOT have, and which are correctly enforced as denied:

| Capability (not held) | Route that requires it | Result for assistant |
|-----------------------|------------------------|----------------------|
| `submissions.view_all` | generic full-submission visibility | denied → falls to group-scoped path (correct) |
| `users.view` | `GET /api/v1/users`, `users/[id]` GET | 403 (`users/route.ts:27`, `users/[id]/route.ts:277`) |
| `users.edit` / `users.delete` | `users/[id]` PATCH/DELETE | 403 |
| `users.manage_roles` | `admin/roles/*` | 403 (`roles/route.ts:18,59`; `roles/[id]/route.ts:29,56,130`) |
| `problems.edit` | test-case visibility in `problems/[id]` GET; PATCH | hidden test cases NOT returned (`problems/[id]/route.ts:57,63-72`); edit 403 (`:88`) |
| `problems.delete` | `problems/[id]` DELETE; locked-testcase bypass | 403 (`:196`) |
| `contests.view_analytics` | `code-snapshots`, `participant-timeline` | 403 at function level (`auth.capabilities`) |
| `contests.export` / leaderboard_full | export, full leaderboard | export gated by `canViewAssignmentSubmissions` (scoped); leaderboard "instructor view" via `canManageContest` → TA gets student view |
| `system.*` | `admin/settings`, `admin/backup`, audit/login/chat logs, plugins | 403 |
| `files.manage` | global file listing / others' files | list scoped to own; cannot manage others' files |
| score-override (no capability; gated by `canManageGroupResourcesAsync`) | `groups/[id]/assignments/[assignmentId]/overrides` | TA excluded (only owner/co_instructor/`groups.view_all`) — **cannot tamper with grades** |

---

## Detailed findings

### FINDING 1 — Global `problems.view_all` leaks all problem statements, incl. hidden exam/recruiting problems (High, Confirmed)

**Capability:** `problems.view_all`
**Route(s):**
- `src/lib/auth/permissions.ts:107-113` — `canAccessProblem`: `if (caps.has("problems.view_all")) return true;` (no group / visibility check at all).
- `src/app/api/v1/problems/route.ts:26-61` — `GET /api/v1/problems`: with `problems.view_all`, returns the full problems table with no visibility/group filter (it explicitly supports `?visibility=hidden`).
- `src/app/api/v1/problems/[id]/route.ts:42-72` — `GET /api/v1/problems/[id]`: passes `canAccessProblem`, then returns the full `problem` row (statement, limits, comparison config) for any visibility.

**Problem:** The built-in assistant has `problems.view_all` globally. There is no notion of "problems for groups I teach." So an assistant assigned to group A can enumerate and read the full statement of every `private`/`hidden` problem authored by other instructors for other groups' exams/contests/recruiting tests.

**Abuse scenario:** A TA for an intro course opens `GET /api/v1/problems?visibility=hidden`, finds the unreleased problems for next week's recruiting screening (a different team's group), reads the full statements via `GET /api/v1/problems/{id}`, and leaks them to a candidate. Because the role is "TA-level", this is not expected to be a system-wide content reader.

**Mitigating fact (good):** Hidden **test cases** and expected outputs are NOT exposed — `problems/[id]` GET only attaches `testCases` when `caps.has("problems.edit") || authorId === user.id` (`:57,63-72`), which the assistant fails. So the leak is the *statement / config*, not the secret test data. Still material for unreleased exam content.

**Fix:** Either (a) remove `problems.view_all` from the assistant default and introduce a group-scoped problem-read path (assistant sees only problems linked to assignments in their teaching groups, mirroring `getManageableProblemsForGroup`), or (b) make `canAccessProblem`/`GET /api/v1/problems` treat `problems.view_all` as "all problems they have a group relationship to" for level < instructor, and keep the global meaning only for `groups.view_all` holders. Option (a) is cleaner and matches the stated least-privilege intent.

---

### FINDING 2 — `anti_cheat.view_events` is a GLOBAL bypass in `canMonitorContest` (cross-group leak) (High, Confirmed)

**Capability:** `anti_cheat.view_events`
**Route:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:166-269` (GET), authz at `:180` `const canView = await canMonitorContest(user, assignment);`
**Helper:** `src/lib/assignments/contests.ts:232-242`:

```ts
export async function canMonitorContest(user, assignment) {
  if (await canManageContest(user, assignment)) return true;          // owner/co_instructor/groups.view_all
  if (await isGroupTA(assignment.groupId, user.id)) return true;      // group-scoped TA  ✓
  const caps = await resolveCapabilities(user.role);
  return caps.has("anti_cheat.view_events");                          // ← GLOBAL, NOT group-scoped ✗
}
```

**Problem:** The final clause grants access to anyone holding `anti_cheat.view_events` **regardless of which group the contest belongs to**. The built-in assistant has this capability globally. So the `isGroupTA(...)` group-scoped branch (line 238) is effectively dead for the built-in assistant — the global clause below it always wins. The route returns per-user `ipAddress`, `userAgent`, and the full behavioral event stream (tab switches, copy/paste, blur, heartbeat gaps).

The code comment at `contests.ts:225-228` explicitly intends this ("org-wide proctors … without per-group rows"), but for a *least-privilege TA role* this is over-broad: a TA for one course can monitor anti-cheat telemetry (incl. candidate IP addresses) for unrelated recruiting tests and other instructors' exams.

**Abuse scenario:** Assistant hits `GET /api/v1/contests/{anyExamId}/anti-cheat?userId={candidate}` for a recruiting exam they have nothing to do with and harvests candidate IPs / activity timelines (PII + proctoring intelligence).

**Fix:** Drop the global `anti_cheat.view_events` clause from `canMonitorContest` so monitoring is strictly group-scoped (`canManageContest || isGroupTA`). If a genuine org-wide proctor role is needed, gate the global clause on a higher capability such as `groups.view_all` (admins), not on a capability the built-in TA carries. If org-wide proctoring really must be a TA-level grant, make it a distinct capability (`anti_cheat.view_events_all`) NOT in the assistant default.

---

### FINDING 3 — `anti_cheat.run_similarity` is a dead capability for the assistant (Medium, Confirmed)

**Capability:** `anti_cheat.run_similarity`
**Route:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:21` — `const canManage = await canManageContest(user, assignment);` then 403 if false.

**Problem:** The only route that runs similarity gates on `canManageContest`, which is `canManageGroupResourcesAsync` (`contests.ts:206-216` → `management.ts:72-86`): true only for the group owner, a `co_instructor`, or `groups.view_all`. A TA (`group_instructors.role='ta'`) and a global assistant get **false**. The route does NOT check the `anti_cheat.run_similarity` capability at all. So the assistant's `anti_cheat.run_similarity` capability can never be exercised → dead grant, and a real proctoring task (running similarity) is blocked for TAs.

**Impact:** (a) Under-privilege: a TA who is supposed to help with cheating review cannot run similarity. (b) Spec drift / confusion: the capability matrix advertises a power the role can't use; auditors and admins customizing roles will be misled.

**Fix:** Decide the intent. If TAs should run similarity: change `similarity-check` to `canMonitorContest` (group-scoped) AND add `auth.capabilities: ["anti_cheat.run_similarity"]` to the handler so it is both function- and object-level gated. If they should not: remove `anti_cheat.run_similarity` from `ASSISTANT_CAPABILITIES`. Either way, align route gate and capability.

---

### FINDING 4 — No group-scoped submission LIST API; `GET /api/v1/submissions` is all-or-own (Medium, Confirmed — usability)

**Route:** `src/app/api/v1/submissions/route.ts:46`:

```ts
const userFilter = caps.has("submissions.view_all") ? undefined : eq(submissions.userId, user.id);
```

**Problem:** This list endpoint is strictly binary: `submissions.view_all` → everything, else → only your own. The assistant has neither all-access nor any group-scoped branch here. The carefully built `getSubmissionReviewGroupIds()` (which would scope a TA to assigned groups) is **only wired into** `admin/submissions/export` and `admin/submissions/rejudge` (confirmed by grep — those are its only API consumers). So a TA cannot use the generic submissions list to see their students' submissions; they must go through SSR pages (`groups/[id]/assignments/[assignmentId]/...`) or per-assignment endpoints.

The defaults.ts comment (`:17-21`) claims the scope filter "restricts the assistant to their assigned teaching groups" — but for the *list* endpoint that filter isn't applied; the assistant simply sees nothing but their own. This is a doc/behavior mismatch and a workflow blocker if a TA tool calls `GET /api/v1/submissions`.

**Not a leak** (the binary gate fails closed), but a real TA usability gap and a misleading comment.

**Fix:** Add a third branch to `GET /api/v1/submissions`: when `getSubmissionReviewGroupIds(user.id, user.role)` returns a non-null array (scoped instructor/TA), filter submissions to assignments in those group IDs (join `assignments`, `inArray(assignments.groupId, groupIds)`), the same pattern already used in `admin/submissions/export/route.ts:66-72`. Update the defaults.ts comment to point at the actual enforcement sites.

---

### FINDING 5 — Inconsistent function-level capability gating across contest monitoring routes (Medium, Confirmed)

Three sibling monitoring routes use three different gates:

| Route | Function-level `auth.capabilities` | Object-level check | Reachable by assistant? |
|-------|-----------------------------------|--------------------|--------------------------|
| `contests/[id]/anti-cheat` GET | none (`auth: true`) | `canMonitorContest` (global `anti_cheat.view_events` bypass) | **YES, any group** (Risk 2) |
| `contests/[id]/analytics` GET (`:139`) | none (`auth: true`) | `canViewAssignmentSubmissions` (group-scoped via `assignments.view_status`) | YES, only assigned groups |
| `contests/[id]/code-snapshots/[userId]` GET (`:11`) | `contests.view_analytics` | `canViewAssignmentSubmissions` | **NO** (lacks `contests.view_analytics`) |
| `contests/[id]/participant-timeline/[userId]` GET (`:8`) | `contests.view_analytics` | `canViewAssignmentSubmissions` | **NO** |

**Problem:** The same conceptual surface ("proctor/monitor a contest for a group I teach") is gated inconsistently. A TA can see live analytics and anti-cheat events for their group, but cannot see code snapshots or the participant timeline for the *same* students in the *same* contest, because those two require `contests.view_analytics` (an instructor-only capability) while `analytics` itself does not. This is incoherent and makes the capability set hard to reason about and customize. It also means the `analytics` route's lack of a function-level capability gate is the only thing keeping it open to TAs — easy to "fix" by accident and lock TAs out, or to widen.

**Fix:** Choose one capability that represents "scoped contest monitoring" (e.g., reuse `assignments.view_status` or introduce `contests.monitor`) and apply it uniformly as the `auth.capabilities` gate on all four monitoring routes, with `canViewAssignmentSubmissions`/`canMonitorContest` (group-scoped, no global bypass) as the object-level check. Remove the inconsistency where `analytics` has no function-level gate.

---

### FINDING 6 — `assignments.view_status` is a global capability; scoping is deferred to downstream group checks (Low–Medium, Confirmed latent)

**Capability:** `assignments.view_status`
**Mechanism:** It is the flag that flips `getSubmissionReviewGroupIds` (`submissions.ts:186-190`) and `canViewAssignmentSubmissions` (`submissions.ts:360-374`) from "deny" into "scoped instructor mode", at which point the group restriction is applied by `getAssignedTeachingGroupIds`/`hasGroupInstructorRole`.

**Problem:** The capability itself carries no group binding. The actual scoping correctness depends entirely on every consumer remembering to do the downstream group check. Today the consumers do (confirmed: `canViewAssignmentSubmissions` calls `hasGroupInstructorRole`; export/bulk-rejudge use `getSubmissionReviewGroupIds`). But this is defense-in-depth-by-convention: any new route that checks only `caps.has("assignments.view_status")` without the group check would silently grant a TA cross-group status visibility. The pattern is fragile and should be made structurally safe.

**Abuse scenario (latent):** A future endpoint added with `auth: { capabilities: ["assignments.view_status"] }` and no `canViewAssignmentSubmissions` follow-up would expose all groups' assignment status to every TA.

**Fix:** Establish a single enforced helper (e.g., always go through `canViewAssignmentSubmissions(assignmentId, …)` / `getSubmissionReviewGroupIds(...)` and never gate sensitive reads on the raw `assignments.view_status` capability alone). Add a lint/test guarding that `assignments.view_status` is never the sole gate on a route. Document this in defaults.ts.

---

## Things that are CORRECT (verified — credit where due)

- **Server-side enforcement is real.** `createApiHandler` (`src/lib/api/handler.ts:129-135`) resolves capabilities and 403s before the handler runs; sensitive routes additionally enforce object-level checks. This is not UI-only gating. (Traced `submissions.comment`, `submissions.rejudge`, `users.manage_roles`, `files.upload` end-to-end.)
- **Grade tampering is blocked.** Score overrides (`groups/[id]/assignments/[assignmentId]/overrides`) gate on `canManageGroupResourcesAsync` — a TA (`role='ta'`) is excluded (only owner/co_instructor/`groups.view_all`). Assistant cannot create/delete `score_overrides`. (`overrides/route.ts:48-54`, `management.ts:72-113`.)
- **Hidden test cases / expected outputs are protected.** `problems/[id]` GET only returns test cases to `problems.edit` holders or the author. `sanitizeSubmissionForViewer` strips per-test outputs and scores for non-`submissions.view_all` viewers based on `showResultsToCandidate`/`hideScoresFromCandidates`. (`visibility.ts:69-149`.)
- **Submission detail / comment / rejudge / events are group-scoped** for the assistant via `canAccessSubmission` → `canViewAssignmentSubmissions` → `hasGroupInstructorRole`. Non-assignment submissions (assignmentId null) are owner-only for non-`view_all`. (`permissions.ts:213-241`.)
- **User & role management fully denied** (no `users.view/edit/delete/manage_roles`). System settings, backups, audit/login/chat logs, plugins all denied (no `system.*`).
- **File listing is owner-scoped** for the assistant (`files/route.ts:174-176` adds `eq(files.uploadedBy, user.id)` when lacking `files.manage`); `files/[id]` GET/DELETE enforce object-level ownership/problem-access. (`files/[id]/route.ts:17-60,180-184`.)
- **Group members listing** uses `canAccessGroup` (`members/route.ts:19`) — assistant sees members only of groups they teach or are enrolled in (no `groups.view_all`).
- **Leaderboard "instructor view"** uses `canManageContest`, so a TA gets the anonymized/frozen student view, not full standings — `contests.view_leaderboard_full` is correctly not theirs. (`leaderboard/route.ts:35`, `stats/route.ts:62`.)
- **super_admin safety** is level-based (`cache.ts:104-106`), not name-based; custom roles at super_admin level can't be neutered.

---

## Priority-ranked fix checklist

1. **[High] Scope `problems.view_all` for the assistant (Finding 1).** Remove the global problem-read from the assistant default and/or make `canAccessProblem` + `GET /api/v1/problems` group-scoped for sub-instructor levels. Prevents pre-exam statement leakage across groups.
2. **[High] Remove the global `anti_cheat.view_events` bypass in `canMonitorContest` (Finding 2).** Restrict monitoring to `canManageContest || isGroupTA` (group-scoped). If org-wide proctoring is required, gate it on `groups.view_all` or a separate `*_all` capability not in the assistant default.
3. **[Medium] Resolve the `anti_cheat.run_similarity` dead capability (Finding 3).** Either switch `similarity-check` to `canMonitorContest` + add the capability as the function-level gate, or remove the capability from the assistant. Align route and capability.
4. **[Medium] Add a group-scoped branch to `GET /api/v1/submissions` (Finding 4)** using `getSubmissionReviewGroupIds`, mirroring `admin/submissions/export`. Fix the defaults.ts comment that currently overstates the scoping. Unblocks the core TA review workflow.
5. **[Medium] Unify capability gating across contest monitoring routes (Finding 5).** One capability + one group-scoped object check for analytics / anti-cheat / code-snapshots / participant-timeline.
6. **[Low–Medium] Harden `assignments.view_status` usage (Finding 6).** Never let it be the sole gate; route all sensitive assignment-status reads through `canViewAssignmentSubmissions`/`getSubmissionReviewGroupIds`; add a guard test.

---

## Confidence notes

- Findings 1–5 are **Confirmed** by direct code reading of the cited file:line and tracing definition → checker → route. No runtime testing was performed (review-only), but the control flow is unambiguous in each case.
- Finding 6 is **Confirmed as a latent/structural** concern — current consumers are correct; the risk is future regressions.
- I did not find a confirmed assistant→admin privilege escalation, a way to alter grades/score_overrides, edit problems/test cases, manage users/roles, or change system settings. Those are correctly denied.
