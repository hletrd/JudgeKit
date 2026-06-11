# Critic — RPF Cycle 5 (2026-06-11)

**HEAD:** 04b8c1ec. Multi-perspective critique of the current change surface.

## 1. The cycle-4 flag fix stopped one step short of its own principle
Cycle-4's banner finding (AGG4-1, 15-lens agreement) was "flags must mean what
the docs say they mean". The fix removed two false-flag producers (render,
autosave) but kept the write at a point where acceptance is unknowable — so a
third producer (rejected submit attempts) survived, and it is the one a
stressed student on flaky wifi hits hardest (D5-1's deadline submit-burst).
The lesson for this cycle: when the principle is "evidence rows must map 1:1
to accepted submissions", the write must live after the accept point, not
merely behind an opt-in. Anything else is a smaller version of the same bug.

## 2. The platform's most important signal is invisible at the last mile
Three independent findings this cycle are one product failure: the escalate
flag renders as a raw i18n key (V5-4), heartbeat gaps are computed but never
shown (Trace 2), and ongoing absence is undetectable (D5-3). The telemetry →
storage → API chain is solid after four cycles of hardening; the chain's last
link — a reviewer actually SEEING the evidence — was never closed. The
"reviewer obligation" paragraph in `docs/exam-integrity-model.md` currently
delegates to a dashboard that cannot discharge it. Prioritize the UI half of
the integrity model with the same seriousness as the ingest half.

## 3. Trade-off discipline: loss vs duplication in client telemetry
The cycle-4 claim loop chose loss-on-unload over duplicate-on-crash without
saying so (the comment narrates the lost-update fix only). For audit-grade
telemetry, duplication is recoverable noise; loss is unrecoverable absence of
evidence. The in-flight slot (SEC5-2) restores the right bias cheaply. When a
redesign silently flips a failure-mode bias, the comment should name the new
worst case.

## 4. Dead surfaces accumulate review debt
`heartbeatGaps` (no consumer), `too_many_submissions` (unreachable reason),
`similaritySkippedTooManySubmissions` (dead i18n), the `?? event.eventType`
fallback (dead by API contract), the vestigial pids_limit conditional in the
worker. None is individually serious; collectively they mislead every future
reviewer about what the system does. This cycle should clear the cheap ones
and register the Rust one with an exit criterion.

## 5. What is genuinely good (credit where due)
The judge pipeline's concurrency story (claim SQL invariants, token fences,
self-healing sweeps) reads like a system that has survived four adversarial
review cycles — because it has. Backup/restore is operationally serious
(password re-confirmation, pre-restore snapshot). The integrity-model doc is
honest about what telemetry cannot prove, which is rarer and more valuable
than another feature. Keep that honesty by making the code meet the doc this
cycle rather than softening the doc to meet the code.
