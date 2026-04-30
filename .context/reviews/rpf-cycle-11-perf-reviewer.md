# RPF Cycle 11 — Perf Reviewer

**Date:** 2026-04-29
**HEAD:** `7073809b`. Cycle-10 surface: 6 commits, all markdown.

## NEW findings

**0 HIGH/MEDIUM/LOW NEW.** No runtime code changed.

## Carry-forward perf items, status at HEAD (verified by re-grep)

| ID | Severity | File | Status |
|---|---|---|---|
| AGG-2 | MEDIUM | `src/lib/security/in-memory-rate-limit.ts` (Date.now × 6 at lines 31, 33, 65, 84, 109, 158) | DEFERRED — trigger ("rate-limit module touched 2 more times") not tripped this cycle. File unchanged. |
| PERF-3 | MEDIUM | `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` (238 lines) | DEFERRED — trigger (p99 > 800ms OR > 50 concurrent contests) not met. |
| ARCH-CARRY-2 | LOW | `src/lib/realtime/realtime-coordination.ts` + `src/app/api/v1/submissions/[id]/events/route.ts:48-63` | DEFERRED — trigger (>500 concurrent SSE) not met. |
| C2-AGG-5 | LOW | 5 polling components | DEFERRED — telemetry signal absent; no 7th polling instance. |
| C2-AGG-6 | LOW | `src/app/(public)/practice/page.tsx:417` | DEFERRED — p99 < 1.5s, dataset < 5k. |

## Optional cycle-11 pick analysis (in case the planner promotes)

If the planner is willing to take ONE well-scoped MEDIUM despite the trigger criterion not having tripped, **AGG-2 remains the most defensible candidate**:
- Single file, six call sites, trivial refactor (memoize one `now` per function entry).
- Tests exist (rate-limit.test.ts).
- Risk: low.

**However**, the formal trigger criterion ("rate-limit module touched 2 more times") has not fired since cycle 10. Promoting it mid-cycle is a scope-discipline choice; recommend leaving DEFERRED unless the planner explicitly opts in. The orchestrator's PROMPT 2 wording ("be willing to either tackle ONE well-scoped MEDIUM ... OR if nothing actionable remains under repo rules, emit COMMITS=0") permits either outcome; convergence is acceptable.

## Final sweep

No new perf concerns. No latency regressions detectable from doc-only diff.
