# Persona: Job Applicant (recruiting coding test) — RPF Cycle 1 (2026-06-11)

**Seat:** an external candidate clicking an emailed invitation link for a
timed recruiting test. I've never seen this platform; my job offer rides on
the next 90 minutes. **HEAD:** f977ef4c.

## First-run experience
- Invitation email → `/recruit` token redemption (single-use, hashed at rest,
  expiry/revocation handled — error paths verified in unit logs:
  invalidToken/tokenRevoked/tokenExpired/alreadyRedeemed each give a distinct
  message rather than a generic failure). Good: I learn WHY my link failed.
- **Consent at collection is now real (df74b7d3):** a privacy/consent line
  with a working link appears BEFORE I start, and the data-controller contact
  is the actual hiring company's (PRIVACY_CONTACT_EMAIL), not a hardcoded
  third party. This was a prior trust/legal gap; closed.
- Timer copy for scheduled contests no longer lies about when my window
  starts (4c937f10).

## Environment clarity & language support
- 125 language variants with per-language version info on /languages; the
  editor's language picker matches what the judge actually runs (DB-synced
  language configs). For a candidate the risk of "my local Python ≠ judge
  Python" is addressed by visible versions. Good relative to commercial
  alternatives.
- Compiler/AI assistant are disabled in recruiting mode by default — and the
  new admin override that could re-enable them is platform-global, default
  OFF, and audited. As a candidate I'm assessed under the same rules as
  everyone in the pool. Fair.

## Time pressure & accidental disqualification risks
- **Crash safety:** server-side draft autosave (cb8dd09e) means a browser
  crash at minute 80 no longer destroys my solution — the single worst
  candidate-experience failure mode, now fixed. Recovery is silent though
  (ST3/UX3): a one-line "draft recovered" notice matters MOST in this seat,
  where I can't ask anyone what happened.
- **JA1 (MEDIUM, fairness — shared root with ST1/IN1, confidence High):**
  no staff mechanism extends my personal window if the COMPANY's side fails
  (platform outage, judge backlog during my slot). For recruiting this is
  sharper than for classes: a re-invite forces me to redo the test with
  burned problems (and the company to re-screen). Even a manual
  personalDeadline+N endpoint (audited) would cover incident recovery.
- **JA2 (LOW, anxiety, confidence Medium):** when the judge queue is slow
  (worker reaped mid-window), my submission sits "queued" with no ETA or
  reassurance. The status page shows state but not "the platform is degraded,
  your timer/judging will be honored" — and nothing CAN be honored (see JA1).
  Queue-delay messaging + extension tooling together close the loop.

## Trust / fairness perception
- Anti-cheat telemetry is disclosed via the consent line; retention windows
  are published (data-retention-policy.md) and now enforced incl. audit
  events; my PII on the invitation is scrubbed if my account is permanently
  deleted (16212175). Strong story.
- Score integrity: IOI partial credit computed over all tests (c3a29e8a)
  means the hiring report reflects real performance, not early-break
  artifacts.

## Verdict
The recruiting flow's legal and data-loss sharp edges from the prior pass are
fixed. Remaining: incident-recovery time extension (JA1, shared finding) and
two small reassurance-UX gaps (draft-recovery notice, queue-delay messaging).
