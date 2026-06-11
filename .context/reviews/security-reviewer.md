# Security Reviewer — RPF Cycle 3 (2026-06-11)

**HEAD reviewed:** 63429d97. OWASP-style pass over the cycle-1/2 change surface plus standing auth/authz, secrets, and injection checks on the routes they touch.

## Findings

### SEC3-1 — Integrity-telemetry blackout + false-suspicion flags for accommodated examinees (MEDIUM-HIGH, High, CONFIRMED; same root cause as CR3-1)
`src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:102-104` hard-rejects all anti-cheat events once `now > assignment.deadline`, while `extendExamSession` (`src/lib/assignments/exam-sessions.ts:151`) deliberately moves `personal_deadline` past that close and `validateAssignmentSubmission` (`src/lib/assignments/submissions.ts:259-271`) accepts submissions there. Security consequences, in order of weight:
1. **Evidence integrity:** the proctoring record for the accommodation window is empty — if misconduct happens in those minutes there is no telemetry, and the absence is indistinguishable from the bug.
2. **False accusation surface:** every submission in the window writes a `submission_stale_heartbeat` escalate-tier event (`submissions.ts:336-347`) — fabricated suspicion against exactly the students who hold accommodation letters; a fairness/appeals liability for graded exams and recruiting.
3. The control's documented purpose (heartbeat correlation against curl-submission) silently stops applying for the extended cohort.
Fix: extend the boundary check to honor `exam_sessions.personal_deadline` for windowed exams (one indexed lookup, only on the `now > deadline` branch). Add a regression test that extends a session past the close and asserts events are still accepted and no stale-heartbeat flag is written.

### SEC3-2 — Stale security documentation overstates an enforcement control (MEDIUM, High, CONFIRMED)
`docs/exam-integrity-model.md:55` claims submissions without a fresh heartbeat are "rejected with `HTTP 403 antiCheatHeartbeatRequired`". The code fails OPEN by design since the fairness change (`submissions.ts:328-355` — flag, never block; the error id survives only as a dead union member at `submissions.ts:36`). An instructor reading the doc believes curl-submissions are blocked when they are only flagged — they will not review the dashboard for `submission_stale_heartbeat` events because they believe the attack is impossible. Fix the doc (and remove the dead union member); state the fail-open posture and the review obligation explicitly. Threat-model docs must describe the system that exists.

## Authz / injection / secrets checks on the new surface (verified, no action)
- `PATCH exam-sessions/[userId]` (extend): gated by `canManageGroupResourcesAsync` (same write gate as score overrides); zod-bounds 1–600 min; durably audited with actor/target/amount; extension composes in SQL (`make_interval`) — no clobber race. Monitoring-only TAs correctly cannot extend.
- `GET exam-session` cross-user read requires `canViewAssignmentSubmissions` and target enrollment; non-staff silently fall back to self (no enumeration oracle; 404 `studentNotFound` only for staff). 
- ipOverlap report: same `canMonitorContest` read gate as the event list; parameterized via `rawQueryAll` named params; LIMIT 100; exposes only data staff already see row-wise. Acceptable.
- `code-snapshots` POST now registry-gates `language` and the schema caps `sourceCode` at 256 KiB; per-user + per-IP rate limits; assignment-context validation prevents cross-assignment pollution.
- Anti-cheat POST origin pinning (SEC M-8) intact; the production-only `Origin` requirement still matches `getAuthUrlObject().host`.
- `/api/v1/test/seed`: inert in production (`NODE_ENV === "production"` → 404 regardless of env var), timing-safe token compare, e2e-prefix scoping. Posture unchanged and sound.
- Rate-limit first-insert race (cycle-2 G4): verified the duplicate-key 500 inside a security control is gone at all four sites; ON CONFLICT target is the PK, no semantic loosening (loser is re-read under FOR UPDATE and counted).
- `deploy-docker.sh` self-heal: recovery command is fixed-string (`docker buildx history rm --all`), no interpolation of build output into shell — no injection from a hostile build log.
- No new secrets, no `dangerouslySetInnerHTML`, no raw SQL string interpolation in the cycle-1/2 diffs (checked each).

Final sweep: no High/Critical findings at this HEAD; the two items above are the complete new security surface this cycle. Carried items (TH1, PS2, etc.) remain in the cycle-2 register with unchanged preconditions.
