# Perspective: Student taking assignments/exams — RPF Cycle 6 (2026-06-12)

**HEAD reviewed:** 22e1510f. Walked the student journey end-to-end in code: contest list → start windowed exam → problem workspace → monitor consent → submit (incl. deadline burst, flaky network, disconnect) → results.

## What works well for me at this HEAD
- **Fairness of the integrity gate:** a stale monitor never blocks my submission (fail-open) and since cycle-5 a rejected/rate-limited attempt can no longer add an escalate flag to my record (`submissions/route.ts:396-425`). The thing that gets reviewed is the thing that was actually accepted. This is the right anxiety posture for the deadline minute.
- **Disconnect mid-exam:** my telemetry queues in localStorage with retry/backoff and survives navigation (in-flight slot); my personal deadline is server-side, so reconnecting doesn't shrink my window; submissions are denied only by DB-time checks with explicit error keys (`examTimeExpired`, `assignmentClosed`) that the UI translates.
- **Privacy:** the monitor tells me exactly what is recorded before anything is recorded, and I must accept explicitly.

## Pain points / risks found

### ST6-1 — If staff un-enroll me, the platform disagrees with itself about whether I'm in the contest (MEDIUM, High — student-visible face of SEC6-1)
My contest disappears from "My Contests" (expiry/enrollment-checked) but a bookmarked contest URL still loads the detail page and my submits still succeed via the leftover access token. As a student I cannot tell whether I'm taking the exam or not — and worse, work I submit in that state may be considered invalid by my instructor afterwards. One access verdict everywhere, please.

### ST6-2 — A copy/paste event I generate right before closing the tab can vanish (LOW for me, MEDIUM for the platform — AGG6-2)
Not directly harmful to me — but if integrity review later hinges on "no copy events recorded," missing telemetry can cut both ways (it can also erase the context that would have EXONERATED me, e.g. a copy target inside the editor). Lossless telemetry is pro-student too.

### ST6-3 (carried ST5-5) — The visible countdown trusts my device clock between refocus syncs (`countdown-timer.tsx:47`). Server enforcement is correct, so the failure mode is a wrong DISPLAY (timer says 2:00 left, server says expired). Register carry; exit criterion unchanged (server-time sync indicator in the exam header).

### ST6-4 — Submission burst at the deadline: pages of my own submission list can stutter (LOW — CR6-3)
Same-timestamp submissions make offset pages nondeterministic; my history view can show a row twice or skip one while the queue is hot. Cosmetic but trust-eroding at the worst moment.

## Failure modes checked and found acceptable
- Exam start race (double-click /start): idempotent session creation; I cannot shorten my own window.
- Anti-cheat outage: events 5xx → queued; heartbeat gap appears on staff's view but no automatic penalty exists (escalate requires my SUBMIT with a stale monitor; queue restores liveness on reconnect).
- Browser crash during flush: in-flight slot re-queues at next mount — worst case staff see a duplicate event, never a fabricated one.

## Verdict
The exam path is honest with me at this HEAD. Fix ST6-1 (one access verdict) and the disagreeing-surfaces confusion disappears; everything else is polish.
