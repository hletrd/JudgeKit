# Persona review — Job applicant in a recruiting coding test (RPF cycle 4, 2026-06-11)

**HEAD reviewed:** 7c0a4bd4. Seat: candidate under time pressure on a
recruiting test; trust/fairness perception; disqualification risk.

## JA4-1 — My biggest risk this cycle: being "flagged" for normal behavior (MEDIUM-HIGH, High; AGG4-1)
Recruiting decisions weight integrity signals heavily. Today the platform
records an escalate-tier "possible unmonitored submission" against every
candidate at first problem open and on later navigations after quiet periods
(`page.tsx:167` → `submissions.ts:343`). If the hiring reviewer takes the
docs' reviewer-obligation paragraph literally, I'm presumed-suspicious by
default. Conversely, an actual cheater submitting via curl gets at most one
flag per 90 s (AGG4-2) — the signal punishes the honest and under-counts the
dishonest. Scheduled fix restores submission-only, non-self-suppressing
semantics; for past tests run on affected builds, reviewers should discount
flags that coincide with page loads/autosaves.

## JA4-2 — Accidental-disqualification safeguards (positive, verified in code)
- No hard block at submit time for monitor hiccups (fail-open + flag).
- Telemetry rejected permanently (e.g. token/origin issues) doesn't wedge my
  event queue (cycle-3 tri-state).
- Time extensions granted for incidents reach my countdown within 60 s and
  can never shrink it; my submissions and telemetry both honor the extension.
- Submission rate limits return clear 429 + Retry-After rather than dropping
  work.

## JA4-3 — First-run experience and clarity (carry)
- The forced privacy notice before monitoring starts is clear about what is
  collected (tab switches, copy/paste, IP, code snapshots) — good for
  informed consent.
- Still no pre-test page telling me which languages/runtimes are available
  before I start the clock (JA-clarity carry, owner product decision;
  unchanged this cycle).

## JA4-4 — Time-pressure UX
Countdown, deadline resync, and autosave cadence (10 s while typing) mean a
crash loses at most seconds of code — the snapshot trail also protects me in
disputes ("the code grew organically in my editor"). After AGG4-1 lands,
autosaves carry zero flag risk; today they can add false flags to my record,
which is the JA4-1 issue again from the snapshot side.
