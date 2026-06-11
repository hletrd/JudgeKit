# Verifier (evidence-based correctness) — RPF Cycle 2 (2026-06-11)

**HEAD reviewed:** 4cf01035 (main)
**Mission:** verify cycle-1's 13 implemented fixes (F1–F13) actually do what
their plan/commit messages claim, from the code, not the comments.

## Verdicts on cycle-1 claims

| Item | Claim | Verdict | Evidence |
|---|---|---|---|
| F1 | self-reclaim no longer leaks active_tasks | **HOLDS** | candidate LIMIT 1 (`claim-query.ts:51`); compensation 0/1 gated on `EXISTS claimed` (`:120-126`); all requeue paths null judgeWorkerId so previous_worker_id=workerId implies a genuinely held slot |
| F2 | draft PUT gated, retention added | **HOLDS** | `draft/route.ts:56-58`; `data-retention.ts` sourceDrafts=180; pruner wired (`data-retention-maintenance.ts:139`) |
| F3 | numbering identical, ≤PAGE_SIZE transfer | **HOLDS** | window `ORDER BY sequence_number ASC, created_at ASC` matches both pages' display order; scope filters are problems-only (verified buildAccessFilter / buildTaughtGroupAccessFilter / visibilityFilter); fallback chain preserved (`problems/page.tsx:694`) |
| F5 | CSP matcher guard test | HOLDS | `tests/unit/infra/csp-matcher-coverage.test.ts` walks page routes; non-vacuous (walker-sanity assertion) |
| F6 | exam_mode CHECK + journal catch-up | **HOLDS** | schema check (`schema.pg.ts:977`) + idempotent 0027 with pre-normalize; journal entry idx 27 present |
| F7/F8 | DB-outage default + single override source | **HOLDS** | try/catch in `isAiAssistantEnabled` (`system-settings.ts:223-241`); both resolvers delegate to `getEffectiveModeRestrictions` |
| F9 | toast fires only on server-draft restore | **HOLDS** | `onRestoredRef` invoked only inside the hydration match branch (`use-server-source-draft.ts:82-86`); localStorage path untouched |
| F11 | ipOverlap correct + scoped | **HOLDS** | repeated `@assignmentId` is safe — `namedToPositional` dedupes (`named-params.ts:40-46`); report branch returns before events query |
| F12 | extension composes; honored past close; cannot leak | **HOLDS** | SQL-side `make_interval` increment; `validateAssignmentSubmission` overrides close only when a session deadline ≥ now (`submissions.ts:259-267`); `startExamSession` clamps to assignment deadline (`exam-sessions.ts:83-86`) so only staff extensions can exceed close |

## New issues found while verifying (escalated to this cycle's aggregate)

### V2-1 — Staff-granted extension is invisible to the student until reload (LOW-MEDIUM, High confidence, CONFIRMED)
The student page renders `CountdownTimer deadline={examSession.personalDeadline}`
from server props (`groups/[id]/assignments/[assignmentId]/page.tsx:196-201`)
and gates the problem list on a render-time `isExamExpired` (`:168-169`).
After a staff extension (F12), the running countdown still hits 0 at the OLD
deadline; the student believes time is up (and on next navigation sees the
expired panel) even though the server now accepts their submissions. The exam
flow exposes a session GET (`exam-session/route.ts:93`), so the deadline can
be re-fetched live. Failure scenario is exactly the accommodation/incident
case F12 was built for — the grant exists but the student can't see it.
Fix: client-side periodic/visibility refetch of the personal deadline for
windowed exams (and let the countdown extend), or at minimum surface "your
deadline may have been extended — reload" on expiry.

### V2-2 — Dropped candidate finding (documented so it is not re-raised)
`recordAuditEventDurable` after `extendExamSession` looked like a
500-after-success risk; verified NOT an issue — it never throws
(`audit/events.ts:272-285`, buffer fallback).

## Gate verification on HEAD (executed)
tsc 0 · eslint 0 errors/0 warnings · lint:bash clean · vitest unit 332
files / 2571 tests PASS. Production build deferred to the implementation
phase (runs as part of this cycle's gates).
