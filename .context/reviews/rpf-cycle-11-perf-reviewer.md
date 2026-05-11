# RPF Cycle 11 — Perf Reviewer ( refreshed 2026-05-11 )

**Date:** 2026-05-11
**HEAD reviewed:** `b5008708`

---

## Findings

**0 HIGH/MEDIUM/LOW NEW.**

## Performance-relevant changes verified

- `getDbNowUncached()` moved outside transactions in judge/poll and advisory-lock paths (cycle-9/10 fixes) — reduces transaction hold time.
- `enableAntiCheat` check moved earlier in anti-cheat POST (cycle-10 fix) — avoids unnecessary work when disabled.
- `validateZipDecompressedSize` uses metadata fast-path (O(1) per entry) before falling back to full decompression — good memory/CPU tradeoff.
- `useVisibilityPolling` has 0-500ms jitter on tab-switch resume — prevents thundering herd.

## Deferred perf items (unchanged)

- AGG-2 (Date.now in rate-limit): still executes multiple times per call chain.
- PERF-3 (anti-cheat dashboard query): deferred until p99 > 800ms or >50 concurrent contests.
- C2-AGG-6 (practice search): deferred until p99 > 1.5s or >5k matching problems.

## Verdict

No new perf issues. Prior optimizations verified intact.
