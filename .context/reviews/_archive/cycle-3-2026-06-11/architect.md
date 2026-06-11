# Architect — RPF Cycle 3 (2026-06-11)

**HEAD reviewed:** 63429d97. Focus: structural risks created or revealed by the cycle-1/2 features; coupling and layering checks on the touched modules.

## A3-1 — "Effective exam close for THIS participant" has no single owner (MEDIUM, High — root cause of CR3-1/SEC3-1)
The per-participant end-of-exam is now computed independently in at least three places:
- `src/lib/assignments/submissions.ts:259-271` — `max(assignment close, personal_deadline)` semantics for acceptance;
- `src/lib/assignments/submissions.ts:641-655` — late-penalty scoring keyed on `es.personal_deadline` in SQL;
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:102-104` — `assignment.deadline` only (the bug).
Plus render-side recomputations (`page.tsx:169-170`). Each new consumer of "is the exam still running for user X?" must remember the windowed-session override or it silently diverges. Recommendation: extract `getEffectiveExamCloseAt(assignment, examSession)` (pure, DB-free, in `src/lib/assignments/`) and route the anti-cheat boundary check, the submissions check, and the page-side expiry computation through it. The cycle-3 fix for CR3-1 should land this helper rather than a fourth inline copy — that converts the bug into a structural guarantee. (Scoring's SQL copy can reference the helper's contract in a comment; SQL can't share the function.)

## A3-2 — Client telemetry channel lacks a permanent-failure concept (LOW-MEDIUM, Medium)
`anti-cheat-monitor.tsx` models only success/failure; HTTP semantics (permanent vs transient) are erased at `sendEvent`. As more rejection classes appear (origin pinning, contest boundaries, future device checks), the retry queue will keep treating policy rejections as packet loss. Small fix now (tri-state result, CR3-2); keeps the storage/queue layer unchanged.

## A3-3 — Deploy script: SSH-helpers extraction trigger remains TRIPPED (carry, unchanged)
`deploy-docker.sh` is now ~1,430 lines after G1; the C3-AGG-5 obligation (extract SSH/remote helpers when next touched or at 1,500 lines) was re-documented in cycle-2's register and is still binding. The G1 additions were build-step-scoped so the trigger condition (touching the SSH-helpers area) was not met; the size trigger (1,500) is ~70 lines away. Any cycle that adds remote-exec plumbing must do the extraction first. No new action this cycle beyond the register carry.

## A3-4 — Layering on the cycle-2 modules (verified good)
- `rate-limit-core.ts` as the single DB-primitive layer with consumer-owned semantics is the right shape; cycle-2's G4 landing in the core (not in each consumer) kept the C7-AGG-9 consolidation debt flat as planned. The remaining duplication between `rate-limit.ts` and `api-rate-limit.ts` is policy-level (backoff vs fixed-window) and correctly deferred.
- `worker-staleness-sweep.ts` separating DB-side sweep from pure threshold helpers (`worker-staleness.ts`) preserves DB-free unit tests; the instrumentation-registered unref'd interval is the correct process-lifecycle hook for Next.js.
- `ExamDeadlineSync` wrapping `CountdownTimer` (composition, windowed-branch-only) instead of widening the timer's props was the lower-coupling choice; confirmed scheduled/non-exam branches untouched.

## A3-5 — Review/plan artifact architecture (housekeeping, LOW)
The deferred register chain is at 2 hops (cycle-2 CARRY row → cycle-1 plan in done/). Per the critic's note, when this hits 3 hops the audit trail degrades; next planning pass should re-materialize still-live deferrals into the active plan or the master backlog (`plans/open/2026-04-14-master-review-backlog.md`). This cycle's plan does so for the items it carries.

No new cross-cutting architectural risks found beyond A3-1; the system's module boundaries (judge pipeline, rate limiting, retention, exam lifecycle) remain coherent at this HEAD.
