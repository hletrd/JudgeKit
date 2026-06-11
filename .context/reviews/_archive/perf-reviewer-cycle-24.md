# Performance Reviewer — Cycle 24

**Date:** 2026-04-24
**Reviewer:** perf-reviewer
**Scope:** Full repository — CPU, memory, concurrency, DB query efficiency

---

## Findings

### P-1: [MEDIUM] ZIP Validation Decompresses All Entries Instead of Reading Metadata

**Confidence:** HIGH
**Citations:** `src/lib/files/validation.ts:55-85`

`validateZipDecompressedSize` decompresses every ZIP entry via `entry.async("uint8array")` to measure the decompressed size. For large ZIPs with many entries, this causes significant memory allocation and GC pressure. The per-entry cap is 50 MB and the entry count limit is 10,000, meaning up to 500 GB of sequential allocation and deallocation in the worst case.

JSZip stores `uncompressedSize` in the local file header for most ZIPs. Reading this metadata is O(1) per entry vs O(decompressed size) per entry for the current approach.

**Concrete failure scenario:** A teacher uploads a problem ZIP with 200 small files and one 40 MB data file. The validation function decompresses all 201 entries (potentially hundreds of MB) just to check sizes, delaying the upload by seconds.

**Fix:** Read `entry._data.uncompressedSize` or parse the local file header manually to check sizes without decompressing. Only fall back to full decompression when the metadata is unavailable (some ZIPs use data descriptors that omit the size).

---

### P-2: [MEDIUM] `getRetentionCutoff` Called with `Date.now()` While Data-Retention Maintenance Should Use DB Time

**Confidence:** MEDIUM
**Citations:** `src/lib/data-retention.ts:38-40`, `src/lib/data-retention-maintenance.ts`, `src/lib/db/cleanup.ts`

`getRetentionCutoff` defaults to `Date.now()`. While the clock-skew window for a 365-day retention period is negligible, for short retention periods (e.g., chat messages at 30 days, audit events at 90 days), a few minutes of clock skew could cause premature deletion or delayed pruning.

More importantly, `DATA_RETENTION_LEGAL_HOLD` is checked using app-server time, while the data's timestamps are stored using DB-server time. If there's a clock skew, data could be deleted even when a legal hold is active (if the app server thinks more time has passed than the DB server).

**Fix:** Accept an optional `nowMs` parameter that defaults to `Date.now()` and allow callers to pass DB server time.

---

### P-3: [LOW] Shared Poll Timer Queries All Submission IDs Even When No Subscribers Remain

**Confidence:** MEDIUM
**Citations:** `src/app/api/v1/submissions/[id]/events/route.ts:186-217`

`sharedPollTick` first checks `submissionIds.length === 0` and returns early. However, the timer is only stopped when `submissionSubscribers.size === 0` in `unsubscribeFromPoll` (line 168). There's a brief window between the last unsubscribe and the timer stop where a tick can fire with no subscribers. This is benign (the query returns empty results), but a more efficient approach would be to check subscribers before querying.

**Fix:** No fix needed — the current behavior is correct and the wasted query is at most one per tick interval (1 second). Not worth the complexity of adding an additional check.

---

## Files Reviewed

- `src/app/api/v1/submissions/[id]/events/route.ts` (full)
- `src/lib/files/validation.ts` (full)
- `src/lib/data-retention.ts` (full)
- `src/lib/data-retention-maintenance.ts` (referenced)
- `src/lib/db/cleanup.ts` (referenced)
- `src/lib/assignments/contest-scoring.ts` (full)
- `src/lib/realtime/realtime-coordination.ts` (full)
- `src/proxy.ts` (full)
