# RPF Loop Cycle 1 — Performance Reviewer (2026-05-03)

**HEAD reviewed:** `37a4a8c3` (main)
**Reviewer:** perf-reviewer

## Summary
No HIGH NEW perf findings. Major perf hardening has already landed in the last month (deep-page cap reduced 10000→1000, sidecar fast-path for rate-limit, parallel `Promise.all` aggregations). Two LOW items remain.

## NEW findings

### PERF-1: [LOW] `pre-restore-snapshot.ts` buffers entire DB export in memory before writeFile

- **File:** `src/lib/db/pre-restore-snapshot.ts:36-52`
- **Code:**
  ```ts
  const stream = streamDatabaseExport({ sanitize: false });
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce(...);
  const merged = new Uint8Array(total);
  ...
  await writeFile(fullPath, merged);
  ```
- **Description:** The function consumes the streaming export into an array of `Uint8Array` chunks, then concatenates them into a single buffer of the FULL export size, then writes that buffer. For a database with N submissions/audit rows, the single-buffer copy is O(N) memory pressure. On a busy 8GB-RAM app server with a million submissions, the export can be ~500MB-2GB; concatenating doubles the peak (chunks + merged) until GC. This is a known anti-pattern — `Readable.fromWeb(stream).pipe(createWriteStream(fullPath))` would stream directly to disk.
- **Confidence:** HIGH
- **Failure scenario:** Restore on a production-sized DB OOMs the app server.
- **Fix:** Use `pipeline(Readable.fromWeb(stream as ReadableStream<Uint8Array>), createWriteStream(fullPath))` from `node:stream/promises` and `node:fs`. This avoids the in-memory buffering entirely.

### PERF-2: [LOW] `data-retention-maintenance.ts` runs all 5 prune jobs serially inside the catch wrapper

- **File:** `src/lib/data-retention-maintenance.ts:96-105`
- **Description:** The 5 prune jobs (chat, anti-cheat, recruiting, submissions, login) are awaited sequentially. Each is a batched delete with a 100ms sleep between batches. On a large DB the maintenance window can be ~minutes serial, when 4 of the 5 tables are independent and could run in parallel. This isn't urgent — maintenance runs daily — but on a clogged server it's slow.
- **Confidence:** MEDIUM
- **Failure scenario:** Daily maintenance window slips past a peak-traffic window.
- **Fix:** `await Promise.all([pruneChatMessages(nowMs), pruneAntiCheatEvents(nowMs), pruneRecruitingInvitations(nowMs), pruneSubmissions(nowMs), pruneLoginEvents(nowMs)])`. Acceptable concurrency since each is a different table.

### PERF-3: [LOW] `participant-status.ts` `now` parameter forces a `getDbNowMs()` call per row

- **File:** `src/lib/assignments/participant-status.ts:73-112`
- **Description:** The function is pure — `now` is passed in by caller. But callers in tight loops (e.g., per-row in a 1000-student status table) may call `getDbNowMs()` once per call. Confirmed at use sites that `now` is computed once outside the loop. No issue at HEAD.
- **Confidence:** LOW (informational)
- **Status:** Acceptable.

## Final-sweep checklist

- [x] Re-read all assignment-status SQL aggregations: `submissions.ts:605-654` is parallelized; uses window functions.
- [x] Re-read `compiler/execute.ts` — pLimit queue still unbounded (tracked under cycle 3 C3-AGG-6, deferred). No new perf regression.
- [x] No new findings at HEAD beyond the 2 LOWs above.
