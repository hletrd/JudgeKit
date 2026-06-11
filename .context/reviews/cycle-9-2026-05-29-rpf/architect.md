# Architect — Cycle 9 (RPF)

**Date:** 2026-05-29 · **HEAD:** 24939e42 (main)

## Email provider abstraction
`EmailProvider` interface (`providers/types.ts`) with smtp/resend/sendgrid/ses
implementations and a selector (`providers/index.ts`). Clean strategy pattern.
The `from` fallback chain is duplicated across 3 HTTP providers but that is below
the repo's consolidation threshold (3 callers); a shared helper would add a layer
for marginal gain. No coupling concern.

## Scoring single-source-of-truth
`buildIoiLatePenaltyCaseExpr` (scoring.ts) is the single SQL source of truth for
IOI late-penalty, now consumed identically by the full board and the live rank.
The cycle-8 fix correctly avoided extracting a shared SQL aggregation builder
(only two callers) — over-abstraction was correctly resisted. Architecture is
sound here.

## Deferred architectural items (re-defer, preconditions unchanged)
- ARCH-CARRY-1 (raw API handlers): exit = API-handler refactor cycle.
- ARCH-CARRY-2 (SSE O(n) eviction): exit = SSE perf cycle OR >500 conns.
- AGG-9 / rate-limit 3-module duplication: exit = consolidation cycle.

## Verdict
No net-new architectural finding.
