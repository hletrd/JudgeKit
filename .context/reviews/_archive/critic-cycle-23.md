# Critic — Cycle 23

**Date:** 2026-04-24
**Scope:** Multi-perspective critique

---

## C-1: [MEDIUM] SSE connection leak on unhandled errors (confirms TR-1)

**Confidence:** HIGH
**Cross-agent agreement:** TR-1, D-1 (related but different)

The SSE route handler has an asymmetric cleanup contract: the `close()` function inside the `ReadableStream` handles cleanup for normal flow, but the outer `catch` at line 467 does not. This is the most impactful finding in this cycle because it can cause user lockout from SSE connections under DB error conditions.

---

## C-2: [LOW] Ranking cache SWR `getDbNowMs()` per-request overhead (confirms P-1)

**Confidence:** MEDIUM

The stale-while-revalidate pattern for the ranking cache adds a `SELECT NOW()` query on every cache check. For a feature as frequently accessed as the contest leaderboard during a live event, this is wasteful. The cache's staleness tolerance is 15 seconds — accepting a 1-2 second clock skew for the staleness check would eliminate this overhead.

---

## C-3: [LOW] Contest access tokens lack expiry (confirms S-1)

**Confidence:** MEDIUM

The `contest_access_tokens` table has no expiry mechanism. This is a design gap rather than a bug — tokens are created for a contest but never revoked. Adding an `expiresAt` column or validating against the assignment deadline would close this gap.

---

## C-4: [LOW] Secret column redaction fragmentation (confirms A-2)

**Confidence:** HIGH

This has been identified in prior cycles but remains unfixed. The three independent redaction config points (export, logger, settings API) represent a DRY violation that will cause bugs when new secret columns are added. A centralized registry would prevent this class of bug entirely.

---

## Summary

- Total findings: 4
- MEDIUM: 1 (C-1)
- LOW: 3 (C-2, C-3, C-4)
