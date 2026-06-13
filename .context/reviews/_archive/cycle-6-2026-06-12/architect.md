# Architect — RPF Cycle 6 (2026-06-12)

**HEAD reviewed:** 22e1510f. **Lens:** boundary ownership, predicate duplication, layering of the cycle-5 additions.

## Findings

### A6-1 — "Has contest access via token" is a boundary predicate implemented six times with two semantics (MEDIUM, High, CONFIRMED)
The token-validity rule lives inline in: `platform-mode-context.ts` (×3, expiry-checked SQL), `contests.ts:getContestsForUser` (expiry-checked SQL), `anti-cheat/route.ts` POST (expiry-checked SQL), `submissions.ts:validateAssignmentSubmission` (Drizzle, NO expiry), `public-contests.ts` ×2 (Drizzle, NO expiry). Predictably they drifted (SEC6-1). Architectural fix: one owning module (new `src/lib/assignments/contest-access-tokens.ts`, sibling to the existing `access-codes.ts`) exporting (a) a Drizzle `findValidContestAccessToken(assignmentId, userId)` and (b) an SQL fragment/EXISTS builder for the raw-SQL call sites, both expiry-checked. Lifecycle writes (creation expiry policy, revocation-on-roster-removal) belong to the same module so the next policy change lands once.

### A6-2 — Telemetry transmission has two shapes; only one is crash-safe (MEDIUM, High — same root as D6-3/AGG6-2)
The monitor has a hardened queue path (claim loop + in-flight slot + backoff) and a legacy direct-send path (`reportEvent`). Every hard-won invariant of cycle-4/5 (no loss window, single-flight, bounded duplicates) holds only on the first path. Unify: `reportEvent` becomes enqueue-then-flush, making the queue the single transmission pipeline. This deletes a behavioral fork rather than adding code.

### A6-3 — Presentation module extraction (cycle-5 A5-2) verified holding
`anti-cheat-presentation.ts` is the single source for colors/labels/details formatting; both consumers import it; the source-grep inventory test pins catalog coverage. No drift after one cycle. The tier MODEL stays in `lib/anti-cheat/review-model.ts` — layering respected (lib has no component imports).

### A6-4 — Dead vocabulary should be pruned from the similarity result contract (LOW, High)
`SimilarityRunReason` retains `service_unavailable` though no producer emits it (CR6-2). Contracts that advertise unreachable states get cargo-culted into new consumers (the dashboard branch proves it). Prune the member; the type system then guarantees honesty.

## Standing observations (unchanged, carried)
- `deploy-docker.sh` remains 1433 lines with the SSH-helper extraction trigger TRIPPED (C3-AGG-5) — binding on the next cycle that touches SSH/remote-exec plumbing; this cycle does not.
- `judge-worker-rs` cosmetics (AGG5-7) untouched by design — exit criterion is a behavioral Rust edit, none planned this cycle.

## Final sweep
No new cross-layer imports (components → lib only; lib never imports components); dynamic imports in `canMonitorContest` resolve to the same cached `resolveCapabilities` (`capabilities/index.ts:27` re-exports the cache implementation) — no split-brain capability resolution.
