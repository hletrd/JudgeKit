# RPF Cycle 5 (2026-06-11) — Aggregate Review

**Date:** 2026-06-11
**HEAD reviewed:** 04b8c1ec (main) — cycle-4's completed tree (deployed
healthy at 9966bfdf on all three targets) + cycle-4's final docs commit.
**Cycle:** 5/100 (orchestrator-numbered)
**Lenses:** 11 specialist + 6 persona files in this directory, all fresh at
this HEAD (cycle-4 versions moved to `_archive/cycle-4-2026-06-11/`).
**Baseline gates on review HEAD (executed):** tsc 0 · eslint 0/0 ·
lint:bash clean · unit 2606/2606 PASS.

## AGENT FAILURES
None of the named reviewer subagents are registered in this environment (no
Agent tool is available to this cycle's runner; `.claude/` contains no agent
definitions — same condition as cycles 1–4). Per the established fan-out
fallback, every lens was executed directly by the cycle agent and written to
its own file; no lens was dropped. Recorded for provenance.

## Merged findings (deduped; severity/confidence preserved at max across lenses)

### AGG5-1 — `submission_stale_heartbeat` flags are recorded for REJECTED submissions; rows carry no submission linkage, IP, or DB-time (MEDIUM-HIGH, High, CONFIRMED)
**Lenses:** code-reviewer CR5-1 + CR5-5, security SEC5-1 + perspective-
security §1/§5, debugger D5-1 + D5-5, tracer Trace 1, verifier V5-1/V5-2,
critic §1, architect A5-1, test-engineer TE5-1, document-specialist
DOC5-1/DOC5-2, perspective-student ST5-1, perspective-instructor IN5-1,
perspective-job-applicant JA5-1/JA5-4(a) — **14-lens agreement; highest
signal.** The probe+INSERT in `validateAssignmentSubmission`
(`submissions.ts:343-392`) precede the assignment-problem check (`:395`) and
all post-validation rejections in `submissions/route.ts` (`canAccessProblem`
403; in-tx 429/429/503/403). A deadline submit-burst on a stale monitor
fabricates multiple escalate flags with zero accepted submissions —
contradicting `docs/exam-integrity-model.md` ("a submission was accepted…",
"every such submission is flagged") and diluting the platform's primary
curl-bypass detection. Fix: validator becomes probe-only
(`probeStaleHeartbeat` option returning the staleness verdict); the submit
route records the flag AFTER the successful insert with `submissionId` +
submitting IP in details and DB-time `createdAt`; doc + review-model comment
updated in the same series; red-first tests per TE5-1.

### AGG5-2 — The escalate flag is illegible in the review UI: no i18n label (en+ko), no severity color, JSON-dump details; dead `??` fallback (MEDIUM, High, CONFIRMED)
**Lenses:** designer DES5-1/2/3, verifier V5-4, document-specialist DOC5-3,
code-reviewer CR5-2, test-engineer TE5-2, architect A5-2 (presentation
constants duplicated across dashboard + timeline — same bug twice),
perspective-instructor IN5-1, perspective-assistant TA5-1 — 8-lens.
Fix: shared presentation module (colors incl. red for the flag, tier colors,
details formatter incl. the `{latestEventAt, ageMs, thresholdMs,
submissionId}` payload), `eventTypes.submission_stale_heartbeat` messages in
both locales (Korean at default letter-spacing), replace the dead
`?? event.eventType` with the `t(key) !== key` guard; catalog-coverage test
pinning every `EVENT_TIERS` key has a label in both locales.

### AGG5-3 — `heartbeatGaps` is computed on every userId-filtered poll and consumed by NOTHING; ongoing absence undetectable (MEDIUM, High, CONFIRMED)
**Lenses:** perf P5-1, security SEC5-3, debugger D5-3, tracer Trace 2,
test-engineer TE5-3, designer DES5-4, perspective-instructor IN5-2,
perspective-assistant TA5-1, perspective-admin AD5-2 — 9-lens.
Fix: gate the scan behind `includeGaps=1`; render gaps in
`participant-anti-cheat-timeline.tsx` (which passes the param); append a
synthetic boundary at DB NOW() so the current absence shows as an `ongoing`
gap. **This edits the anti-cheat GET, which FIRES deferred AGG4-5's exit
criterion** — resolution recorded in the plan: scan becomes opt-in+consumed;
the pagination `count(*)` stays with rationale (indexed, feeds `total`).

### AGG5-4 — Claim-loop drops the in-flight event on unload (LOW-MEDIUM, Medium, LIKELY)
**Lenses:** security SEC5-2, debugger D5-2, tracer Trace 3, critic §3,
test-engineer TE5-4, perspective-student ST5-2, perspective-job-applicant
JA5-4(d) — 7-lens. `anti-cheat-monitor.tsx:113-115` claims (removes from
storage) before `await sendEvent`. Fix: single in-flight slot key written
synchronously before the send, cleared after the result, recovered into the
queue at next flush start (bounded duplicate beats silent evidence loss);
component + storage tests.

### AGG5-5 — Similarity reason truthfulness + route timer hygiene (LOW, High, CONFIRMED)
**Lenses:** code-reviewer CR5-3, tracer Trace 4, architect A5-3,
test-engineer TE5-5, document-specialist DOC5-4, perspective-instructor
IN5-3. Engine returns `service_unavailable` for the >MAX-rows fallback case;
`too_many_submissions` + its translated UI branch are dead. Fix in lib
(emit the declared reason); move the route's `clearTimeout` to `finally`.

### AGG5-6 — `describeElement` TypeError on SVG copy/paste targets (LOW, Medium, LIKELY)
**Lenses:** code-reviewer CR5-4, debugger D5-4, test-engineer TE5-6.
`anti-cheat-monitor.tsx:289-291` — `className.split` on SVGAnimatedString.
Guard with a string check / `getAttribute("class")` + unit test.

### AGG5-7 — judge-worker-rs cosmetics: vestigial pids_limit conditional; misleading `should_retry_without_seccomp` name (LOW, High, CONFIRMED — REGISTER)
**Lenses:** code-reviewer (final sweep), perspective-security §2. Rust edit
requires worker-image rebuild and is outside this cycle's configured gates;
behavior is correct (fails closed). Deferred with exit criterion (see plan).

### AGG5-8 — Similarity rerun delete+reinsert resets evidence timestamps (LOW product/policy, Medium, RISK — REGISTER)
**Lenses:** perspective-instructor IN5-3, perspective-security §1, critic §4
adjacent. "When was this pair first flagged" is unanswerable after a re-run.
Owner decision (preserve earliest createdAt per pair vs refresh semantics).

## Cross-lens positives (provenance)
Sandbox fails closed on seccomp-init failure; claim-SQL invariants re-derived
sound; backup/restore operationally serious; CSRF/auth middleware ordering
sound; Korean letter-spacing rule compliant; cycle-4 G1–G4 verified in place
with no regressions beyond the rejected-submit hole (Trace 5).

## Carried deferred register (cycle-4) — exit criteria re-checked this cycle
- **AGG4-5 (anti-cheat GET read cost): exit criterion FIRES** (this cycle
  edits the GET for AGG5-3) → resolved inside G3, disposition in the plan.
- AGG3-7 (run_remote_build retry log): deploy script not edited → carry.
- DES3-1 (assertive announce): no exam-page a11y pass this cycle → carry.
- TA3-1-followup (+DES4-4 label nuance): owner scheduling → carry.
- JA-clarity (language preview): owner decision → carry.
- CARRY block (C3-AGG-5 SSH extraction — no SSH-plumbing edit planned;
  IN2-2; DEFER-ENV-GATES; cycle-1 register rows): preconditions unchanged →
  carry.

## Disposition summary
Implement this cycle: AGG5-1, AGG5-2, AGG5-3 (incl. AGG4-5 resolution),
AGG5-4, AGG5-5, AGG5-6.
Register with criteria: AGG5-7, AGG5-8. Carry: remainder of cycle-4 register
verbatim.
