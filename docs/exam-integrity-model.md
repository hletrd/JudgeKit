# Exam integrity model

_Last updated: 2026-06-11_

JudgeKit currently uses an **integrity telemetry** model, not a full proctoring model.

## What the platform does today
- records browser focus/tab-switch signals
- records copy/paste/context-menu style signals
- supports code-similarity review workflows
- preserves timing/progress/submission history for human review

## What these signals mean
These signals are **advisory**. They are useful review inputs, but they are not proof of misconduct on their own.

## Recommended evidence model
1. Start from the assumption that any single signal may be noisy or explainable.
2. Corroborate with submission history, timestamps, problem context, and any relevant human explanation.
3. Reserve serious sanctions for cases where multiple pieces of evidence align.

## Implication for high-stakes use
If you need stronger assurance for formal exams or public contests, you should add operational controls beyond the current browser-event telemetry model.

## Deliberate telemetry boundaries (decided posture, not omissions)

The client event set is `tab_switch, copy, paste, blur, contextmenu, heartbeat`
(`src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`). Two commonly
requested signals are intentionally NOT collected:

- **No fullscreen enforcement / fullscreen-exit events.** Forcing fullscreen
  is hostile UX (kills accessibility tooling, multi-monitor reference setups)
  and is trivially defeated by a second device, so it adds candidate stress
  without adding real assurance. `blur`/`visibilitychange` already cover
  app-switching on the same machine.
- **No second-device / off-screen detection.** Client-side telemetry cannot
  see a phone running an LLM or a human helper off-screen. Pretending
  otherwise would be dishonest; the containment for those vectors is
  post-hoc — the similarity check plus code-snapshot replay (a pasted full
  solution shows up as one large snapshot delta plus a `paste` event).

Instructors should treat telemetry as **deterrence and evidence**, not
prevention. If your assessment genuinely requires prevention-grade proctoring,
pair JudgeKit with Safe Exam Browser or live human proctoring (see below).

## Review tiers
- **Context** — ambient telemetry such as periodic heartbeats. Useful for timeline reconstruction, not suspicion on its own.
- **Signal** — browser-behavior events such as tab switches or copy/paste that may justify closer review but still need corroboration.
- **Escalate** — stronger anomalies such as code-similarity findings or IP-change patterns that merit deeper human investigation.

## Submission-time heartbeat correlation (fail-open since 2026-05; flag, not block)

For assignments where `examMode != "none"` AND `enableAntiCheat = true`, the submission API (`/api/v1/submissions` POST, via `validateAssignmentSubmission` in `src/lib/assignments/submissions.ts`) checks that the latest **client-emitted** `anti_cheat_events` row for `(userId, assignmentId)` is no older than 90 seconds (`ANTI_CHEAT_HEARTBEAT_FRESHNESS_MS`). The browser monitor's heartbeat throttle is 60 s, leaving a 30 s buffer for clock skew and network jitter. Two scoping rules keep the flag honest (RPF cycle-4, tightened cycle-5):

- **Only ACCEPTED submissions are flagged.** The validator's freshness probe is read-only (`probeStaleHeartbeat` opt-in — passed only by the submit route); the route records the flag only after the submission insert succeeds, and the flag's `details.submissionId` references the exact accepted submission (the row also stores the submitting IP, timestamped on the DB clock like every other evidence row). Problem-page renders, editor autosave snapshots, and rejected submit attempts (rate-limited, problem-mismatched, queue-full, expired-session) never produce a flag — a deadline retry burst on flaky wifi cannot fabricate evidence.
- **The freshness probe counts client events only** (`tab_switch`/`copy`/`paste`/`blur`/`contextmenu`/`heartbeat` — `src/lib/anti-cheat/client-events.ts`). Server-inserted rows (`submission_stale_heartbeat` itself, `code_similarity`) are not browser liveness, so one flag cannot suppress the next and a similarity finding cannot stand in for a heartbeat.

**This check FAILS OPEN.** A submission with a stale (or absent) heartbeat is **accepted**, and a `submission_stale_heartbeat` anti-cheat event (Escalate tier) is recorded instead. An earlier hard-block (`HTTP 403`) was removed deliberately: it destroyed honest candidates' work on flaky networks at the deadline — an unacceptable fairness/legal harm for graded exams and recruiting tests — while an open decoy tab kept heartbeating and defeated the block anyway. The control's value is the evidence trail, not prevention.

**Reviewer obligation:** before trusting results for a high-stakes assessment, review the anti-cheat dashboard for `submission_stale_heartbeat` events. A flag means "the ACCEPTED submission referenced in its details was sent by a client with no recent browser-monitor activity" — corroborate per the evidence model above (it may be a network hiccup; it may be a curl submission from a second device).

What this closes:
- A candidate submitting with `curl` from a second device while the browser monitor sits idle no longer goes UNNOTICED — every such submission is flagged for human review. It is detection, not prevention.

What this does **not** close:
- A candidate who keeps the monitor open in a hidden tab while another browser drives the actual coding session. The heartbeats look honest because they are honest — for that browser. The platform still cannot prove that the submitted code came from the screen the monitor is observing.
- A candidate using AI-generated code typed into the editor with normal cadence. The similarity check compares structure across this platform's submissions; it does not, on its own, identify generative output.

For high-stakes assessments these residual gaps still warrant pairing JudgeKit with Safe Exam Browser or live human proctoring.

## Staff time extensions (windowed exams)

Group-managing staff can extend ONE participant's windowed-exam session
(`PATCH /api/v1/groups/[id]/assignments/[assignmentId]/exam-sessions/[userId]`,
1–600 minutes) for accommodations and incident recovery. Integrity-relevant
semantics:

- The extension moves `exam_sessions.personal_deadline` and may exceed the
  assignment close **by design**. Submission acceptance, late-penalty scoring,
  AND anti-cheat telemetry ingest all follow the per-participant effective
  close (`getEffectiveExamCloseAt` in `src/lib/assignments/exam-close.ts`),
  so an accommodation window stays monitored and does not generate false
  `submission_stale_heartbeat` flags.
- Extensions only ever ADD time (the endpoint cannot shrink a window) and
  concurrent extensions compose.
- Every extension is durably audited (`exam_session.extend`: who granted whom
  how many minutes, and the resulting deadline) so grading-relevant timing is
  reconstructable during disputes.

## What admins / `system.settings` callers bypass

Any role with `system.settings` capability (built-in `admin`, `super_admin`) is exempt from the deadline, exam-window, and heartbeat-freshness checks. This is intentional — admins need to clear stuck submissions during incidents — but it means an admin account compromise cannot be defended against by the integrity model. See `docs/admin-security-operations.md` for the matching credential-handling guidance.
