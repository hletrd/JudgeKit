# Exam integrity model

_Last updated: 2026-04-12_

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

## Review tiers
- **Context** — ambient telemetry such as periodic heartbeats. Useful for timeline reconstruction, not suspicion on its own.
- **Signal** — browser-behavior events such as tab switches or copy/paste that may justify closer review but still need corroboration.
- **Escalate** — stronger anomalies such as code-similarity findings or IP-change patterns that merit deeper human investigation.

## Submission-time heartbeat enforcement (since 2026-05)

For assignments where `examMode != "none"` AND `enableAntiCheat = true`, the submission API (`/api/v1/submissions` POST, via `validateAssignmentSubmission` in `src/lib/assignments/submissions.ts`) now requires that the latest `anti_cheat_events` row for `(userId, assignmentId)` be no older than 90 seconds (`ANTI_CHEAT_HEARTBEAT_FRESHNESS_MS`). The browser monitor's heartbeat throttle is 60 s, leaving a 30 s buffer for clock skew and network jitter.

What this closes:
- A candidate cannot submit code with `curl` from a second device while the browser monitor sits idle on the exam tab. Without a fresh heartbeat the submission is rejected with `HTTP 403 antiCheatHeartbeatRequired`.

What this does **not** close:
- A candidate who keeps the monitor open in a hidden tab while another browser drives the actual coding session. The heartbeats look honest because they are honest — for that browser. The platform still cannot prove that the submitted code came from the screen the monitor is observing.
- A candidate using AI-generated code typed into the editor with normal cadence. The similarity check compares structure across this platform's submissions; it does not, on its own, identify generative output.

For high-stakes assessments these residual gaps still warrant pairing JudgeKit with Safe Exam Browser or live human proctoring.

## What admins / `system.settings` callers bypass

Any role with `system.settings` capability (built-in `admin`, `super_admin`) is exempt from the deadline, exam-window, and heartbeat-freshness checks. This is intentional — admins need to clear stuck submissions during incidents — but it means an admin account compromise cannot be defended against by the integrity model. See `docs/admin-security-operations.md` for the matching credential-handling guidance.
