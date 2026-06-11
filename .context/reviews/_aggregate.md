# RPF Cycle 4 (2026-06-11) — Aggregate Review

**Date:** 2026-06-11
**HEAD reviewed:** 7c0a4bd4 (main) — cycle-3's completed tree (deployed healthy
at 566e54dc on all three targets) + cycle-3's final docs commit.
**Cycle:** 4/100 (orchestrator-numbered)
**Lenses:** 11 specialist + 6 persona files in this directory, all refreshed at
this HEAD (cycle-3 versions moved to `_archive/cycle-3-2026-06-11/`).
**Baseline gates on review HEAD (executed):** tsc 0 · eslint 0/0 ·
lint:bash clean · unit 336 files / 2597 tests PASS.

## AGENT FAILURES
None of the named reviewer subagents are registered in this environment (no
Agent tool is available to this cycle's runner — same condition as cycles
1–3). Per the fan-out fallback, every lens was executed directly by the cycle
agent and written to its own file; no lens was dropped. Recorded for
provenance.

## Merged findings (deduped; severity/confidence preserved at max across lenses)

### AGG4-1 — `submission_stale_heartbeat` escalate flags are inserted by page renders and autosaves, not just submissions (MEDIUM-HIGH, High, CONFIRMED)
**Lenses:** code-reviewer CR4-1, security SEC4-1 + perspective-security W1,
debugger D4-1, tracer Trace 1, verifier V4-2/V4-3, critic §1, architect A4-1
(root cause: write inside a validator), test-engineer TE4-1 (path untested),
document-specialist DOC4-1/2, designer DES4-2, perspective-student ST4-1,
perspective-instructor IN4-1, perspective-assistant TA4-2,
perspective-job-applicant JA4-1 — **15-lens agreement; highest signal.**
`validateAssignmentSubmission` inserts the escalate-tier flag when the
freshness probe misses (`src/lib/assignments/submissions.ts:319-362`) and is
called from `src/app/(public)/practice/problems/[id]/page.tsx:167` (GET render)
and `src/app/api/v1/code-snapshots/route.ts:62` (autosave every 10–60 s) in
addition to the submit route. Guaranteed false flag per participant at first
problem open (render precedes monitor mount); repeats per navigation after a
>90 s telemetry gap; autosave flags misread as submissions
(doc + review-model promise submission semantics). Fix: explicit opt-in
(`recordStaleHeartbeatFlag`) passed ONLY by `submissions/route.ts`; red-first
tests for both non-submit paths + fail-open pin; one doc sentence + comment
update so V4-2/V4-3 become true.

### AGG4-2 — Freshness probe counts server-inserted event types; flags self-suppress (MEDIUM, High, CONFIRMED)
**Lenses:** security SEC4-2 + perspective-security W2, code-reviewer CR4-2,
debugger D4-2, tracer Trace 2, test-engineer TE4-1(3) — 5-lens agreement.
`submissions.ts:320-330` has no `event_type` filter; `submission_stale_heartbeat`
(same file) and `code_similarity` (`code-similarity.ts:421`) rows count as
browser liveness → one flag suppresses the next ~90 s of flags; a similarity
hit reads as liveness. Fix: restrict the probe to client-emitted types via
`inArray`; requires AGG4-7's extraction.

### AGG4-3 — Lost-update race in the client pending-events queue (LOW-MEDIUM, Medium, LIKELY)
**Lenses:** debugger D4-3, perf P4-3, tracer Trace 4, architect A4-4,
code-reviewer CR4-5. `anti-cheat-monitor.tsx`: `performFlush` load(:91)/
save(:103) spans awaits; `reportEvent`'s sync load-push-save(:165-167) in
between is clobbered; concurrent flush loops can double-send. Fix: per-event
claim loop + `isFlushing` guard; single storage-touching function; component
test for mid-flush append.

### AGG4-4 — `startExamSession` re-fetch race throws user-facing `assignmentClosed` (LOW, High, CONFIRMED)
**Lenses:** code-reviewer CR4-3, debugger D4-4, perspective-student ST4-3.
`exam-sessions.ts:108-110`. Fix: distinct internal error key (mapped to a
retryable generic failure), not a false "closed" verdict at exam start.

### AGG4-5 — Anti-cheat GET monitoring-read cost (LOW, Medium, RISK)
**Lenses:** perf P4-1, perspective-admin AD4-3, perspective-security §6.
`anti-cheat/route.ts:283-286` count(*) per poll; `:296-325` 5000-row gap scan,
no time-window. Indexed; no incident. DEFER-eligible with exit criterion (see
plan).

### AGG4-6 — Doc/comment claims of submission-only flag semantics are false until AGG4-1 lands (MEDIUM doc-accuracy, High, CONFIRMED)
**Lenses:** verifier V4-2/V4-3, document-specialist DOC4-1/DOC4-2.
`docs/exam-integrity-model.md:54-56,79`; `review-model.ts:12-15`. Fix lands
WITH AGG4-1 (code is brought to the documented design + one clarifying
sentence).

### AGG4-7 — `CLIENT_EVENT_TYPES` exported from a route module (LOW, High, CONFIRMED)
**Lenses:** architect A4-2, code-reviewer CR4-4, test-engineer TE4-4.
`anti-cheat/route.ts:21-28`; lib cannot import it (layering). Move to
`src/lib/anti-cheat/client-events.ts`; route consumes it; update the
source-pin test to guard the new location + route import equality.

## Cross-lens positives (provenance)
Extension accommodation flow coherent end-to-end (tracer Trace 3, IN4-2,
ST4-2); PATCH cross-field revalidation closes the late-window divergence
hypothesis (debugger, code-reviewer); Korean tracking rule compliant (DES4-3);
judge per-worker auth + background staleness sweep healthy (SEC4-3, AD4-1);
authorization boundaries held under probing (perspective-security §3).

## Carried deferred register (cycle-3) — exit criteria re-checked this cycle
AGG3-7 (run_remote_build retry log): not touched this cycle → carry.
DES3-1 (assertive announce): no exam-page a11y pass this cycle → carry.
TA3-1-followup (timeline extension rendering): owner scheduling → carry
(+ DES4-4 status-label nuance noted to bundle with it).
JA-clarity (language preview): owner decision → carry.
CARRY block (C3-AGG-5 — re-measured 1433 lines, still tripped; IN2-2;
DEFER-ENV-GATES; cycle-1 register rows): preconditions unchanged → carry.

## Disposition summary
Implement this cycle: AGG4-1, AGG4-2, AGG4-3, AGG4-4, AGG4-6, AGG4-7.
Defer with criteria: AGG4-5. Carry: cycle-3 register verbatim.
