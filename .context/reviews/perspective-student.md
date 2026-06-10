# Persona: Student taking assignments/exams — RPF Cycle 1 (2026-06-11)

**Seat:** an undergraduate taking a graded windowed exam and weekly assignments.
**HEAD:** f977ef4c. Flows walked (code-level end-to-end): join group → open
assignment → start windowed exam → write code in editor → submit → watch
verdict → disconnect/reconnect mid-exam → deadline expiry.

## What got materially better since the last persona pass (2026-05-30)
- **Crash recovery now real (cb8dd09e/e791862a):** my unsubmitted code
  survives a browser/device crash via server drafts, not just localStorage.
  The never-overwrite invariant means recovery can't destroy what I typed.
  This was the #1 anxiety failure mode in the prior student review.
- **My partial scores are no longer inflated (c3a29e8a):** in IOI assignments
  every test runs, so the score I see during the exam equals the score in the
  gradebook later — no "I had 66% during the exam, 20% after the rejudge"
  shock.
- **Fair leaderboard:** my frozen-window self-rank now reflects score
  overrides (15b37782); freeze times are validated to lie inside the contest
  (9a99d7ae) so "the whole contest was frozen by mistake" can't happen.
- **Timer doesn't error:** countdown no longer throws hydration errors
  (d280a45f); exam timer copy for scheduled contests was corrected (4c937f10).

## Disconnect / timeout mid-exam (asked explicitly by the review brief)
- The exam session row (`exam-sessions.ts`) is created once, idempotently;
  `personalDeadline` is fixed wall-clock at start and clamped to the
  assignment deadline. Disconnecting does NOT pause the clock; reconnecting
  re-reads the same session (GET is idempotent) and the editor restores my
  draft (server-side now). Verdict: recovery story is good; the clock policy
  is strict-wall-clock.
- **ST1 (MEDIUM, product/fairness, confidence High):** there is NO mechanism
  for the instructor to extend MY personal deadline — not for a documented
  proctoring incident, a network outage on the testing site, or an
  accessibility accommodation (extra-time entitlements are standard in
  education). `examSessions` has no extension field and no staff endpoint
  mutates `personalDeadline`. Score overrides exist post-hoc, but
  "let the student keep working +15 min" does not. Failure: a campus network
  blip eats 20 minutes of a 60-minute exam; the instructor's only tools are
  (a) nothing, (b) delete the session row in SQL. This is feature work, but
  the fairness gap is real and it WILL happen in a real exam term.
- **ST2 (LOW, UX, confidence Medium):** when my personalDeadline passes
  mid-typing, submission is rejected server-side. The countdown shows 00:00:00
  but the editor stays editable — wasted typing into a dead exam. An explicit
  "time expired — submissions closed, your draft is saved" state would reduce
  panic. (Draft IS saved, which softens it.)

## Submission flow & feedback quality
- Queue status (`queue-status` route + SSE events) gives live verdicts;
  failed-test feedback shows the diff view, which now marks +/- non-color
  (604646bb). Compile errors surface stderr (with darkened, readable styling
  per 22141e82). Good.
- **ST3 (LOW, clarity, confidence Medium):** draft recovery is silent
  (designer UX3). As the person under exam stress, code appearing "by itself"
  in a fresh browser is exactly the moment I fear anti-cheat misfiring
  ("will this look like paste-from-elsewhere?"). One toast line fixes both
  the confusion and the fear. Note anti-cheat paste-detection should ignore
  programmatic draft restoration — verified `setSourceCode` path is the app's
  own state update, not a paste event, so no false flag today; keep it that
  way when wiring the toast.

## Fairness perception
- Anti-cheat now defaults ON for new exams from the general form (48856f17) —
  consistent proctoring across creation paths means I'm not judged under
  different regimes depending on which dialog my instructor used.
- AI assistant / standalone compiler are blocked in exam modes unless the
  ADMIN (not my instructor) opted out platform-wide — uniform for all
  students. Acceptable.

## Verdict
The two prior top student complaints (lost work on crash, inflated-then-
corrected scores) are genuinely fixed. The remaining real gap is ST1
(no time-extension path) — a fairness/accommodation hole rather than a bug.
