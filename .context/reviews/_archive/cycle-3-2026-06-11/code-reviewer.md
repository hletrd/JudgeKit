# Code Reviewer — RPF Cycle 3 (2026-06-11)

**HEAD reviewed:** 63429d97 (main; cycle-2 completed tree, deployed+healthy on all three targets).
**Method:** full re-read of every file touched by the 28 cycle-1/2 commits (rate-limit core + consumers, exam-deadline sync, exam sessions/extension, anti-cheat route + monitor, code-snapshots route, deploy-docker.sh, staleness sweep, backup verification, catalog ranking), plus spot reads across API handler plumbing, schema, and exam pages. Baseline gates re-run on this HEAD: tsc 0 · eslint 0/0 · lint:bash clean · unit 333 files / 2579 tests PASS.
**Fan-out note:** no Agent tool is registered in this environment (same as cycles 1–2); this lens was executed directly by the cycle agent.

## Findings

### CR3-1 — Anti-cheat POST rejects events after `assignment.deadline` even when the participant holds a staff-extended personal deadline (MEDIUM-HIGH, High, CONFIRMED)
`src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:102-104`:
```ts
if (assignment.deadline && now > assignment.deadline) {
  return apiError("contestEnded", 403);
}
```
Cycle-1's `extendExamSession` (`src/lib/assignments/exam-sessions.ts:139-163`) explicitly allows `personal_deadline` to exceed the assignment deadline ("that is the point of an accommodation"), and `validateAssignmentSubmission` (`src/lib/assignments/submissions.ts:259-271`) honors it for SUBMISSIONS. But the anti-cheat event POST was never taught about per-session deadlines, so the moment `now > assignment.deadline`:
- every heartbeat/tab_switch/copy/paste event from the extended participant gets 403 `contestEnded` → integrity telemetry goes dark exactly during the accommodation window;
- on each submission, the heartbeat-correlation gate (`submissions.ts:312-355`) finds no fresh event and records a `submission_stale_heartbeat` **escalate-tier false-suspicion flag** against the accommodated student;
- the instructor's heartbeat-gap report (`anti-cheat/route.ts:269-306`) shows the same window as a gap.
Failure scenario: instructor grants +30 min to a student with an accommodation letter; the student's last 30 minutes are unmonitored AND every submission in that window is flagged as suspicious. Fix: when `assignment.examMode === "windowed"` and `now > assignment.deadline`, look up `exam_sessions.personal_deadline` for `(assignmentId, user.id)` and accept while `now <= personal_deadline` (single indexed lookup; mirror the submissions.ts pattern). Add a red-first test.

### CR3-2 — AntiCheatMonitor retries permanently-rejected (4xx) events as if they were transient network failures (LOW, High, CONFIRMED)
`src/components/exam/anti-cheat-monitor.tsx:52-69`: `sendEvent` collapses every non-OK response into `false`, so a 403 (`contestEnded`, `forbidden`, origin mismatch) is queued to localStorage and retried `MAX_RETRIES=3` times with backoff — requests that can never succeed, and they delay genuinely-retriable events behind them in `performFlush`'s sequential loop. Fix: treat HTTP 4xx (except 408/429) as permanent — drop without queueing; keep retry semantics for network errors and 5xx/429.

### CR3-3 — Dead error-union member `antiCheatHeartbeatRequired` (INFO, High, CONFIRMED)
`src/lib/assignments/submissions.ts:36` still carries `"antiCheatHeartbeatRequired"` in the validation error union, but no code path returns it since the gate became fail-open (flag-only). Dead vocabulary invites the belief that the hard block still exists (the docs DO believe it — see document-specialist DOC3-1). Remove the member alongside the doc fix.

### CR3-4 — GET exam-session runs the staff-visibility resolver for every plain student poll (LOW, Medium, CONFIRMED — perf-reviewer owns the numbers)
`src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-session/route.ts:112-116` computes `canViewAssignmentSubmissions(...)` unconditionally, though its result only matters when `?userId=` is present. Since cycle-2's `ExamDeadlineSync` turned this GET into a 60 s steady poll for every active windowed examinee, the wasted lookups multiply. Restructure: only resolve `canViewOthers` when a `userId` param is present and differs from `user.id`; identical externally-visible semantics (non-staff querying others already silently falls back to self).

## Verified-sound (no action)
- `rate-limit-core.ts` conflict-safe first insert + degraded upsert path: correct; `rowCount` handling is driver-safe; all four consumer sites re-read under FOR UPDATE after a lost race. Lost-race tests exist and pass.
- `run_remote_build` in `deploy-docker.sh`: the `cmd | tee` exit status is safe because the script runs `set -euo pipefail` (line 94); temp-file cleanup on every path; recovery is signature-scoped only.
- `CountdownTimer` deadline-prop reset (`countdown-timer.tsx:69-78`) correctly un-expires and re-arms thresholds — the expired→extended transition works.
- `ExamDeadlineSync` mounts even when the session is already expired (`page.tsx:197-207`), so a post-expiry extension is still picked up. Good design.
- `sweepStaleWorkers` + unref'd interval: idempotent transitions, single-shot logging per transition.
- `verify-db-backup.sh` restore-test: trap-based cleanup correct; DSN rewrite handles query strings; dumps are plain `pg_dump` without `--create` so no cross-DB `\connect` hazard.

Final sweep: no other file touched by cycles 1–2 shows logic regressions; the remaining repo surface matches the carried register in `plans/open/2026-06-11-cycle-2-rpf-review-remediation.md`.
