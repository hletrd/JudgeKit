# Critic — RPF Cycle 9 (2026-05-16)

**HEAD:** `9854e072`

## Critique

The cycle-8 batch shipped a lot of operator-directed policy changes
(plaintext plugin secrets, 5-year chat retention, +2s wall-clock TLE
budget) under "DEFERRED" status without a single formal policy
artifact recorded. The deferred ledger captures *what* was deferred
but not *why* the operator decided so. If a future reviewer comes back
in 6 months, the ledger says "operator-directed" but no one will
remember which operator, when, or for what reason. Recommend:

- Add a single `docs/policy/operator-decisions.md` (or similar) that
  records policy choices with date + decision-maker + brief
  justification + link to the deferred ledger entry. This is exactly
  the kind of doc that protects the next maintainer from re-litigating
  decisions.

(This recommendation is documentation-only and should not block any
implementation cycle; it is queued as a follow-up.)

## Cross-agent agreement (this cycle)

- code-reviewer + architect agree on the duplicate language map
  (CR9-2 / ARCH9-1) — high signal, schedule the consolidation now.
- code-reviewer + test-engineer agree the consolidation should bring
  unit coverage along.
- security-reviewer + architect carry-forward agree the
  plaintext-secrets policy needs a JSDoc marker (ARCH8b-2).

## Verdict

Mostly green. The single biggest gap is governance-of-deferred-items,
not code. Take the quick wins (consolidation + tests + plan archive)
this cycle.
