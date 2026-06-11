# Perspective: Student taking assignments/exams — RPF Cycle 5 (2026-06-11)

**HEAD:** 04b8c1ec. Walked the windowed-exam flow in code: start button →
problem workspace → monitor consent → autosave → submit → verdict →
disconnect/extension paths.

## ST5-1 — My panicked deadline retries secretly multiply evidence against me (MEDIUM-HIGH fairness, High, CONFIRMED)
Scenario: my wifi dropped for two minutes, the monitor heartbeat went stale,
I reconnect with 30 seconds left and hammer submit. The rate limiter rejects
the extra clicks (correct, and the UI tells me to slow down) — but each
rejected attempt ALSO wrote an escalate-tier `submission_stale_heartbeat`
flag I will never see (`submissions.ts:343-392` before the route's 429
exits). My instructor's dashboard now shows a cluster of "out-of-monitor
submission" flags that correspond to NO submissions. I cannot explain what I
cannot see, and the cluster shape (repeated flags) reads as deliberate.
Fairness fix = CR5-1/G1: flag only the accepted submission, once, with its
id, so the human review the docs promise is reviewing something real.

## ST5-2 — Disconnect/timeout mid-exam: mostly humane, verified
- Submit fails open on stale heartbeat (no 403 destroying my work) ✓.
- Offline events queue in localStorage and flush on reconnect/refocus ✓
  (residual: an event in flight during a tab close is silently lost —
  SEC5-2; as a student I'd rather it duplicate than vanish, since absence
  of telemetry is what gets flagged).
- Extension mid-exam: countdown moves LATER only, never earlier; toast +
  persistent note; pages refresh to recompute gates ✓ (cycle-2/3 work
  verified still in place).
- Start-exam race no longer tells me the exam is "closed" when it isn't
  (cycle-4 G4 verified; generic retryable error instead) ✓.

## ST5-3 — Tab-switch grace period is humane (verified)
3 s grace before a `tab_switch` is recorded (`anti-cheat-monitor.tsx:255`)
absorbs Alt-Tab slips and notification clicks; the warning toast still
teaches me the rule. Good balance of deterrence vs anxiety.

## ST5-4 — Privacy notice is clear, but per-tab (LOW, Medium)
Consent is stored in sessionStorage (`:41`), so a second tab or a browser
restart re-prompts. As a student this is mildly annoying but arguably
correct (re-consent after context loss); flagging only so the behavior is a
decision, not an accident. No change requested.

## ST5-5 — Countdown trusts my clock between syncs (LOW, Medium, carried-adjacent)
`countdown-timer.tsx:47` computes remaining = deadline − `Date.now()`;
refocus re-syncs with server time. A skewed client clock shows a wrong
countdown while the tab stays focused, though SUBMISSION enforcement is
DB-time (so the server is fair even when my display lies). Acceptable;
worth a future "synced" indicator. Not scheduled this cycle.

## What feels good (credit)
Problem statements render sanitized HTML with code blocks; submit feedback
includes failed-test-case index; the fail-open + human-review posture is
exactly what an honest student wants from an anti-cheat system.
