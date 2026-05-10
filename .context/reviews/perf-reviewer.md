# Performance Review — Cycle 37

**Reviewer:** perf-reviewer
**Date:** 2026-05-09
**HEAD:** 07174a9b

## Summary

0 new findings. No performance regressions detected.

## Reviewed Areas

### Memory & Timer Management
- Anti-cheat monitor: All timers (heartbeat, retry, event listeners) properly cleared on unmount. The cycle 35 fix correctly gates heartbeat rescheduling on document visibility (lines 187-191).
- Submission list auto-refresh: Cycle 33 fix prevents timer leak on unmount during async tick.
- Export button: Cycle 33 fix adds AbortController and revokes blob URLs.
- Rate limit eviction: `stopRateLimitEviction()` exported (cycle 34 fix), enabling clean test teardown.

### Fetch Patterns
- External API calls (chat providers) use `AbortSignal.timeout(25_000)`.
- Internal calls use `apiFetch` with 30s timeout and AbortController support.
- apiFetchJson handles network errors gracefully without throwing.

### Database
- `getDbNow()` cache deduplicates DB time queries within a single render.
- Judge claim uses atomic SQL with `FOR UPDATE SKIP LOCKED` — no race conditions.
- Raw SQL claims use proper parameter binding.

### Build & Bundle
- JSZip uses dynamic imports (cycle 30 fix) — avoids loading in critical paths.
- SEO json-ld RegExp constants extracted to module level (cycle 31).

### Rust Worker
- Docker stdout/stderr capped at 4 MiB to prevent memory exhaustion from verbose output.
- Compilation timeout clamped between 30s and 600s.
- Dead letter directory pruned to max 1000 files.

## Conclusion

No new performance issues found in this cycle.
