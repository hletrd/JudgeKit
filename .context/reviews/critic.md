# Critic (multi-perspective) — RPF Cycle 1 (2026-06-11)

**HEAD reviewed:** f977ef4c. Role: challenge the change surface and the other
lenses' calls; surface what everyone else is incentivized to miss.

## Critique of the remediation wave itself
1. **The fixes are real, but two of them re-created the pattern they fixed.**
   - H4 (release dead worker's slot) fixed distinct-worker reclaim and left the
     self-reclaim sibling leaking (CR1). The H4 guard test pins the fixed case
     only — the suite now actively *asserts* the incomplete boundary.
   - The CSP patch (6035ca83) fixed four routes by extending the same fragile
     enumeration that caused the bug; second occurrence of the class. A
     finding-driven loop that patches instances without closing classes will
     meet these again; A1(b)'s route→matcher guard test is the cheap class fix.

2. **The stable-numbering fix traded a UX paper-cut for an O(N) query on the
   two most-visited catalog pages** (P1) — in the same week M4 removed exactly
   this query shape from analytics. Inconsistent internal standard; fix P1.

3. **Severity honesty check:** S1 (draft language) is rate-limit-bounded and
   authenticated-only; MEDIUM is right, don't inflate it to HIGH in the
   aggregate. CR1 is a slow capacity corrosion, not an outage: MEDIUM with a
   trivially safe fix is the correct framing. Nothing in this delta is HIGH —
   and that should be stated plainly rather than padded.

4. **Per-viewer problem numbers** (/problems) will eventually confuse a
   classroom ("everyone open problem 37" — different 37s). The /practice
   variant is viewer-independent (public catalog) and fine. Worth a one-line
   doc/UI hint or switching /problems to a viewer-independent ordinal later;
   LOW product note, not a defect.

5. **The admin override knobs** (allowAiAssistantInRestrictedModes /
   allowStandaloneCompilerInRestrictedModes) are global. The plausible operator
   mistake is enabling one for a workshop and forgetting it before an exam.
   Mitigations already present: default-false, admin-only, durable audit. A
   "restricted-mode overrides active" banner on the admin dashboard would
   close the forgetting loop (LOW, UX).

6. **Process note:** cycle 9 declared convergence (0 findings) and a fresh
   multi-agent pass days later confirmed 16 real issues, one CRITICAL. The
   honest conclusion: convergence claims should be scoped to "this lens set
   over this surface", which this cycle's reports do. Keep persona lenses in
   the rotation — C1 (IOI scoring) was invisible to file-by-file review and
   found by behavioral review.

## Where I disagree with other lenses (none materially)
- D1 (reclaim deadlock): agree LOW/defer — the trigger needs two simultaneously
  half-dead-but-alive workers; engineering for it now is speculative.
- D3 (clock-skew insta-stale): agree note-only; the heal window is ≤30 s.

## Final sweep
Re-read the six "verified sound" remediation diffs hunting for camouflage
(tests adjusted to pass rather than behavior fixed) — found none; the IOI fix
in particular fixed the masking test explicitly. No additional findings.
