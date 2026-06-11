# Code review — RPF cycle 4 (2026-06-11)

**HEAD reviewed:** 7c0a4bd4 (main; cycle-3's completed tree, deployed healthy on all
three targets at 566e54dc + one docs commit).
**Baseline gates at this HEAD (executed):** tsc 0 · eslint 0/0 · lint:bash clean ·
unit 336 files / 2597 tests PASS.
**Lens:** code quality, logic, SOLID, maintainability.

## Inventory / method
Cycles 1–3 reviewed the broad repo (29/9/7 findings). This cycle re-reviewed the
full cycle-3 diff (`63429d97..HEAD`: exam-close helper, anti-cheat ingest +
monitor, exam-session GET, smoke knob) line-by-line, then audited the modules
those changes interact with: `src/lib/assignments/{submissions,exam-sessions,
exam-close,contests}.ts`, `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`,
`src/components/exam/*` (all 5 files), `src/app/api/v1/code-snapshots/route.ts`,
`src/app/(public)/practice/problems/[id]/page.tsx`, `src/app/api/v1/submissions/route.ts`,
`src/lib/validators/assignments.ts`, `src/lib/judge/{auth,worker-staleness-sweep}.ts`,
`src/lib/realtime/realtime-coordination.ts`, plus the API route inventory (112 routes).

## Findings

### CR4-1 — `validateAssignmentSubmission` performs a WRITE side effect and is called from read paths (MEDIUM-HIGH, High, CONFIRMED)
`src/lib/assignments/submissions.ts:319-362`: when `enableAntiCheat && examMode
!== "none"` and the caller's latest anti-cheat event is older than 90 s (or
absent), the validator INSERTS an escalate-tier `submission_stale_heartbeat`
row. The validator is invoked from three call sites:
- `src/app/api/v1/submissions/route.ts:264` — real submissions (intended);
- `src/app/api/v1/code-snapshots/route.ts:62` — editor autosaves, fired every
  10–60 s by `problem-submission-form.tsx:140-182` (NOT submissions);
- `src/app/(public)/practice/problems/[id]/page.tsx:167` — a server-component
  page RENDER (a GET acquiring a DB write side effect).
Concrete failure: a participant starts a windowed exam and opens the first
problem. At render time zero anti-cheat events exist → the page render itself
inserts a false escalate flag before the monitor has ever run. Every later
problem navigation after >90 s without a recorded event repeats this. The flag
`details` does not record which path inserted it, and both
`docs/exam-integrity-model.md:54-56` and `src/lib/anti-cheat/review-model.ts`
define the event as "a SUBMISSION was accepted while the heartbeat was stale" —
reviewers will read autosave/page-render flags as suspicious submissions.
Fix: make the flag insert opt-in (`recordStaleHeartbeatFlag` option, passed
only by the submissions route); page render and autosave keep validating but
never write. Red-first tests; doc sentence stating only the submit path records
the flag.

### CR4-2 — Heartbeat-freshness query counts server-inserted rows (MEDIUM, High, CONFIRMED)
`src/lib/assignments/submissions.ts:320-330` selects the latest
`anti_cheat_events` row for (assignment, user) with NO `event_type` filter.
Server-side inserts (`submission_stale_heartbeat` — same file;
`code_similarity` — `src/lib/assignments/code-similarity.ts:421`) therefore
count as "recent browser activity". Consequences: (a) one stale flag suppresses
the next ~90 s of stale flags — a curl-only submitter is flagged once, then
their own flag row keeps them "fresh"; (b) a similarity hit (escalate
evidence!) reads as liveness. Fix: restrict the freshness query to the
client-emitted event types (`CLIENT_EVENT_TYPES`), which requires extracting
that list out of the route module (see CR4-4).

### CR4-3 — `startExamSession` throws `assignmentClosed` for a session-lookup race (LOW, High, CONFIRMED)
`src/lib/assignments/exam-sessions.ts:108-110`: after
`insert ... onConflictDoNothing()` the re-fetch failing can only mean an
insert/visibility anomaly, yet the code throws `Error("assignmentClosed")`,
which callers map to a user-facing "assignment closed" message — actively wrong
diagnostics for an internal failure. Throw a distinct error key.

### CR4-4 — `CLIENT_EVENT_TYPES` is exported from a Next route module (LOW, High, CONFIRMED)
`src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:21-28`: route files
should only export handlers/segment config; the const is unreachable for lib
code without importing a route module (cycle risk), which is exactly what CR4-2
needs. Move to `src/lib/anti-cheat/` and import it in the route; update the
source-pin test `tests/unit/api/anti-cheat-public-event-types.test.ts:13`.

### CR4-5 — Pending-queue load/save interleaving can drop events (LOW-MEDIUM, Medium, LIKELY)
See debugger D4-3 (same finding, jointly diagnosed):
`src/components/exam/anti-cheat-monitor.tsx:90-105` vs `:163-172`.

## Verified-clean notes (for provenance)
- Cycle-3's `getEffectiveExamCloseAt` refactor in `submissions.ts:259-278` is
  behavior-identical to the pre-refactor guard, including the `>= now` boundary
  (checked all four personal/assignment-deadline orderings).
- `assignmentPatchSchema` lacking cross-field refinement is NOT a hole: the
  PATCH handler merges into `assignmentMutationSchema.safeParse`
  (`.../[assignmentId]/route.ts:129-156`), so exam modes still null
  `lateDeadline` — the anti-cheat ingest's deadline-only check cannot diverge
  from a late window (windowed/scheduled exams cannot carry one).
- Korean letter-spacing rule honored at every `tracking-*` site sampled (all
  are `locale !== "ko"`-gated or alphanumeric-only, e.g.
  `public-header.tsx:306`, `access-code-manager.tsx:153`).

Confidence labels per finding above. Final sweep: no other write-side-effect
sites found in validators (`grep` over `src/lib/**/validate*`); no new TODO/FIXME
introduced by cycle 3.
