# Architect review — RPF cycle 4 (2026-06-11)

**HEAD reviewed:** 7c0a4bd4 · gates green.
**Lens:** architectural/design risk, coupling, layering.

## A4-1 — Root cause of this cycle's headline defect: a validator that writes (MEDIUM-HIGH as designed-in risk, High confidence)
`validateAssignmentSubmission` is named, typed, and consumed as a pure
authorization/validation query, but it owns a write (the stale-heartbeat flag,
`submissions.ts:343-354`). Command–query separation was broken in the cycle-1
fail-open redesign, and the predictable consequence followed: two later
callers (page render, snapshot autosave) reused "the validator" for its checks
and silently inherited the side effect. Remedy (minimal, this cycle): make the
side effect an explicit opt-in parameter so every call site states its intent;
the submit route alone opts in. Remedy (directional, recorded only): split
"validate" from "record submission-attempt evidence" into separate functions
the submit route composes.

## A4-2 — Domain constant living in a route module (LOW, High)
`CLIENT_EVENT_TYPES` in `anti-cheat/route.ts:21-28` is the canonical list of
client-emitted telemetry types, but route modules are leaves in the Next.js
layering — nothing in `src/lib` may import them. The freshness fix (SEC4-2)
needs that list in `src/lib/anti-cheat/`; move it there, import from the route
(routes may depend on lib, never the reverse), and update the source-pin test.

## A4-3 — Effective-close ownership: cycle-3's helper held up (positive)
`getEffectiveExamCloseAt` is the single owner of the per-participant close
contract with exactly two consumers; tracer Trace 3 found no third site that
re-derives it ad hoc. The remaining participant-agnostic uses of
`assignment.deadline` (status labels, freeze) are correct as designed.

## A4-4 — Client telemetry queue: implicit shared-state contract (LOW-MEDIUM, Medium)
The localStorage queue has three concurrent writers inside one component
(flush loop, retry timer, reportEvent) coordinated only by JS turn-taking
across awaits — the race in D4-3. Architecturally the queue wants a single
serialized accessor (claim-loop or promise-chain mutex) instead of three
load-modify-save sites; the fix should leave exactly one function that touches
storage.

## A4-5 — Carried structural triggers (unchanged status, re-checked)
- C3-AGG-5: `deploy-docker.sh` SSH-helpers extraction — trigger condition
  re-measured this cycle: 1433 lines (`wc -l`), still TRIPPED; rule stands
  (any cycle touching SSH/remote-exec plumbing must extract first). This
  cycle's plan does not touch the deploy script → carry unchanged.
- AGG3-7 (`run_remote_build` retry log overwrite): exit criterion is "next
  cycle that edits run_remote_build" — not this cycle; carry unchanged.

## Final sweep
No new cross-module cycles introduced by cycle-3 (`exam-close.ts` is leaf-pure;
ingest imports lib only). Schema/migrations untouched. The instrumentation
startup sequence (settings → sweeps → audit flush hook) remains ordered
correctly for the staleness sweep's `getConfiguredSettings()` dependency
(`initializeSettings()` precedes `startWorkerStalenessSweep()`,
`instrumentation.ts:20-28`).
