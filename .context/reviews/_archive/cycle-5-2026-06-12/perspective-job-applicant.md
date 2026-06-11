# Perspective: Job Applicant (recruiting coding test) — RPF Cycle 5 (2026-06-11)

**HEAD:** 04b8c1ec. Walked the candidate journey: invitation token →
provisioned account → test environment → time pressure → submission →
what the recruiter later sees about me.

## JA5-1 — Invisible flags can cost me the job without a real submission behind them (MEDIUM-HIGH trust/fairness, High, CONFIRMED)
Recruiting is the highest-stakes seat for CR5-1/ST5-1: a recruiter screening
20 candidates will treat an escalate-flag CLUSTER as disqualifying without
the deep-dive an instructor might do. Today that cluster can be manufactured
by my own flaky network + deadline retries (flags on rejected attempts), and
the flag rows carry no submission linkage or IP that would let a careful
reviewer exonerate me. G1 (flag-on-accept + submissionId + IP in details) is
a candidate-fairness fix as much as a security fix.

## JA5-2 — First-run experience: verified decent (provenance)
- Token validate route is rate-limited, CSRF-guarded, hash-compared, and
  DB-clock-expiry-checked — no flaky "invalid token" from clock skew ✓.
- Provisioned accounts are exempted from the email-verification compiler
  gate via the platform-mode ordering (`playground/run/route.ts:33-44`
  comment documents the deliberate ordering) — I'm not locked out of the
  run button by a verification email I can never receive ✓.
- Privacy notice before monitoring starts; explicit accept ✓.

## JA5-3 — Time pressure UX (verified + carried)
Countdown re-syncs on refocus, never shrinks on extension, warns at
escalating thresholds with toast-spam suppression after long hides. The
displayed clock trusts my device between syncs (ST5-5 — server enforcement
stays fair). Carried: JA-clarity — still no pre-test page telling me which
LANGUAGES the test allows before I start the clock; unchanged owner
decision.

## JA5-4 — Accidental-disqualification audit (this cycle's lens)
Checked the ways I could look like a cheater by accident:
(a) deadline retry burst → multiple escalate flags — REAL, fixed by G1;
(b) brief Alt-Tab → 3 s grace absorbs it ✓;
(c) copy from the problem statement → recorded but tier "signal" and target
    "problem-description" tells the reviewer it was in-app ✓;
(d) network drop → queued events flush on reconnect; in-flight event at tab
    close can vanish (SEC5-2) — absence of telemetry is itself suspicious,
    so the loss bias matters for candidates too — G4;
(e) hotel/dorm shared IP → I appear in the IP-overlap report with strangers;
    the report is an aggregation staff already had per-row, and the doc's
    evidence model demands corroboration — acceptable, no change.
