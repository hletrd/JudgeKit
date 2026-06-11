# Perspective: Job Applicant (recruiting coding test) — RPF Cycle 6 (2026-06-12)

**HEAD reviewed:** 22e1510f. Walked the candidate journey: invitation link → token redemption + account creation → first-run environment → timed test under pressure → submission → what happens to me afterwards.

## Trust and fairness — what's solid
- **No accidental disqualification by infrastructure:** the integrity gate fails open; rejected submit attempts (rate limit, queue full, expired window) can no longer place an escalate flag on my record (cycle-5 G1). Flags carry the exact submission id + threshold so a human reviewer sees calibrated evidence, not vibes.
- **Redemption flow is careful with me:** password-format mistakes don't burn brute-force counters; the token is the auth boundary, claimed atomically; my window is enforced in DB time, not my laptop's clock.
- **Transparency:** the privacy notice enumerates recorded signals before monitoring starts, and the review-notice copy explicitly states similarity checks do not by themselves identify AI-generated code.

## Risks from my seat

### JA6-1 — Disqualification doesn't actually stop my access (MEDIUM, High — candidate-side face of SEC6-1)
If the recruiter removes me mid-test (suspicion, withdrawal, wrong cohort), my access token still lets me submit until the deadline on some gates while other surfaces deny me. From my side this looks like a glitchy system ("the contest vanished from my list but submitting still works") — and anything I submit in that limbo may be used against me ("kept submitting after removal"). A removed candidate must be cleanly, consistently out.

### JA6-2 — A telemetry hiccup can shave my recorded liveness margin (LOW, Medium — D6-3)
A single failed heartbeat insert silences my recorded liveness for up to 60 s of the 90 s freshness window. The gate fails open so my submission is safe, but the flag that MIGHT then attach to it puts the burden of explanation on me. Two-line server fix; cheap fairness.

### JA6-3 — Lost copy/paste context can remove exculpatory evidence (LOW — AGG6-2)
If my last action before closing the tab was a copy INSIDE the editor (legitimate), losing that event leaves the reviewer with a worse picture of me, not a better one. Lossless telemetry is in my interest.

### JA6-4 (carried — JA-clarity) — Still no pre-test environment preview (language list, judge limits) before the timer starts. For a high-stakes first run, knowing "Python 3.13, 256 MB, 2 s" beforehand is the difference between confidence and panic. Owner product decision; carried with unchanged exit criterion.

## Pressure-UX spot-checks (acceptable)
- Timer: server-enforced; display-only client drift carried as ST5-5.
- Disconnect mid-test: queue + retry keeps my monitor record; my personal deadline doesn't shrink; clear translated errors if I truly run out.
- Submission feedback: pending→judged states poll visibly; compile output redaction follows the problem's setting consistently.

## Verdict
The platform treats candidates fairly by design at this HEAD. JA6-1 is the one scenario where the system's ambiguity could be read as MY misconduct — close it before the next recruiting round.
