# Performance & Concurrency Review — judgekit

**Repo:** `/Users/hletrd/flash-shared/judgekit`
**HEAD:** `0b0ac198`
**Reviewer angle:** Performance / concurrency (no dedicated agent; covered here)
**Date:** 2026-06-26

---

## Coverage

Files inspected end-to-end (read in full):

- `src/lib/judge/claim-query.ts`, `src/app/api/v1/judge/claim/route.ts`, `src/app/api/v1/judge/poll/route.ts`
- `src/lib/judge/worker-staleness-sweep.ts`, `src/lib/judge/worker-staleness.ts`
- `src/lib/db/schema.pg.ts` (all indexes — verified L500–521)
- `src/lib/db/export.ts`, `src/lib/db/export-with-files.ts`, `src/lib/db/cleanup.ts`, `src/lib/db/pool-health.ts`, `src/lib/db/index.ts`
- `src/lib/db-time.ts`
- `src/lib/realtime/realtime-coordination.ts`
- `src/lib/compiler/execute.ts`, `src/lib/compiler/catalog.ts`
- `src/lib/system-settings-config.ts`
- `src/lib/assignments/contest-scoring.ts`, `src/lib/assignments/leaderboard.ts`, `src/lib/assignments/code-similarity.ts`, `src/lib/assignments/code-similarity-client.ts`
- `src/app/api/v1/submissions/route.ts`, `src/app/api/v1/submissions/[id]/route.ts`, `src/app/api/v1/submissions/[id]/queue-status/route.ts`, `src/app/api/v1/submissions/[id]/events/route.ts`
- `src/app/api/v1/problems/route.ts`, `src/app/api/v1/users/route.ts`, `src/app/api/v1/groups/[id]/members/route.ts`, `src/app/api/v1/groups/[id]/assignments/route.ts`, `src/app/api/v1/files/route.ts`
- `src/app/api/v1/contests/[assignmentId]/stats/route.ts`, `.../announcements/route.ts`, `.../clarifications/route.ts`, `.../similarity-check/route.ts`, `.../code-snapshots/[userId]/route.ts`
- `src/app/api/v1/admin/chat-logs/route.ts`, `src/app/api/v1/admin/audit-logs/route.ts`
- `src/app/(public)/rankings/page.tsx`, `src/app/(public)/submissions/page.tsx`
- `rate-limiter-rs/src/main.rs`
- `code-similarity-rs/src/main.rs`, `code-similarity-rs/src/similarity.rs`
- `src/app/sitemap.ts`

Pattern sweeps run: `findMany` / `select().from()` without pagination across `src/app/api/v1`, `cache`/`Cache` usages, index list in `schema.pg.ts`, recently-addressed commits (`ce0ec45f`, `9e1a71b1`, `d8ff9421`, `ea8df27a`).

### Verification of previously-addressed items

| Item | Status | Evidence |
|---|---|---|
| Queue claim / position indexes | PRESENT | `submissions_queue_claim_idx` (L511) on `(status, submitted_at, id)` and `submissions_stale_claim_idx` (L512) on `(status, judge_claimed_at, submitted_at, id)` are both in `schema.pg.ts`. The shape matches `claim-query.ts` (`ORDER BY s.submitted_at ASC, s.id ASC`) and the stale branch (`judge_claimed_at < NOW() - interval`). |
| Quick stats caching (`ce0ec45f`) | PRESENT | `src/app/api/v1/contests/[assignmentId]/stats/route.ts` L48–63: `LRUCache({max:100, ttl:60s})` with `STALE_AFTER_MS=15s` and a single-CTE aggregate. Background refresh cooldown (5s) prevents thundering herd. |
| Lightweight live status polling (`9e1a71b1`) | PRESENT | `submissions/[id]/events/route.ts` L223–254: one batched `select(...).where(inArray(id, submissionIds))` per tick, dispatched to per-connection callbacks. |
| Sitemap batching (`d8ff9421`) | PRESENT | `src/app/sitemap.ts` L40–59: bounded `for` loop with `rowLimit`, breaks on short batch, capped by `MAX_SITEMAP_URLS`. |
| Rich output diff capping (`ea8df27a`) | PRESENT in `src/lib/diff.ts` (capper) + consumer in `output-diff-view.tsx`. |

None re-reported below.

---

## Findings

### PERF-1 — Backup ZIP buffers DB export + every upload + final blob in memory simultaneously

**File:** `src/lib/db/export-with-files.ts` L162–250
**Scenario:** `streamBackupWithFiles` is invoked by the admin backup route. The promise it returns is named "stream" but the body is fully buffered:

1. L171–181: the entire `streamDatabaseExport` is read into `dbChunks: Uint8Array[]`, then `Buffer.concat(dbChunks).toString("utf-8")` materializes the full JSON string (`dbJson`) — first copy.
2. L193–195: `JSON.parse(dbJson)` materializes a second copy (object graph), then `zip.file("database.json", dbJson)` stores the string again inside JSZip's in-memory structure.
3. L209–230: each uploaded file is `readUploadedFile` → `Buffer`, pushed into the ZIP, and also hashed (`sha256Hex(buffer)` re-reads the Buffer). All file Buffers live concurrently inside the JSZip object graph.
4. L239: `zip.generateAsync({type:"uint8array"})` allocates a single contiguous `Uint8Array` holding the entire compressed archive.

**Impact:** For an instance with N MB of DB JSON + M MB of uploads, peak RSS is roughly `3·N + 2·M + final_zip_size` (JSON, parsed object, JSZip file map, file Buffers, output Uint8Array). `MAX_BACKUP_ZIP_DECOMPRESSED_BYTES = 512 MB` (L35) caps decompressed input, but peak RSS still scales with that 512 MB ceiling — easily 1.5–2 GB on a modest instance. The route is admin-only and infrequent, but a successful backup can OOM-kill the Next.js process under memory pressure (and Next.js is the same process serving user traffic).

**Severity:** High
**Confidence:** High
**Fix:** Stream into the response as the ZIP is generated, instead of materializing the whole blob. Options: (a) write `database.json` directly to a temp file and stream uploads through `entry.nodeStream()`; (b) replace JSZip with `archiver` (Node streaming) or `yazl`, which emit `data` events that can be piped to the Response stream. The manifest SHA can be computed over the streamed bytes with a `crypto.createHash('sha256')` Transform. Also drop the redundant `Buffer.concat(dbChunks).toString("utf-8")` + `JSON.parse` round-trip — the manifest only needs `sha256Hex(dbJson)`, and `byteLength` can be accumulated from `dbChunks.reduce((n,c)=>n+c.length,0)` without building one big string.

---

### PERF-2 — Code-similarity Rust /compute has no submission-count cap; caller only caps the TS fallback

**Files:** `src/lib/assignments/code-similarity.ts` L354–390; `code-similarity-rs/src/main.rs` L76–115 + `code-similarity-rs/src/similarity.rs` L332–384
**Scenario:** `runSimilarityCheck` fetches best-per-(user,problem,language) rows from Postgres with **no LIMIT**:

```sql
WITH best AS ( ... ROW_NUMBER() OVER (...) AS rn FROM submissions WHERE assignment_id = @assignmentId )
SELECT ... FROM best WHERE rn = 1
```

The result is handed directly to `computeSimilarityRust(rows, ...)` (L356). `MAX_SUBMISSIONS_FOR_SIMILARITY = 500` is enforced only on the TS fallback (L379). The Rust sidecar's `/compute` handler enforces only a 16 MB body cap (`MAX_COMPUTE_BODY_BYTES`, `main.rs` L23) — no `submissions.len()` cap.

`compute_similarity` in `similarity.rs` L349–383 is O(n²) within each `(problem_id, language)` bucket: nested `for i in 0..ngrams.len() { for j in i+1..ngrams.len() {...} }`. Within a single bucket of 5 000 submissions that is ~12.5 M Jaccard comparisons; within a 20 000-submission bucket (plausible for a large recruiting contest) ~200 M, each doing a hashed-set membership sweep.

**Impact:** A large contest (>500 submissions in one language bucket) on the sidecar path can saturate the `spawn_blocking` rayon pool (the entire service's tokio workers starve on `spawn_blocking` queue depth), or OOM the sidecar (`Vec<SimilarityPair>` accumulation, plus the `HashMap<(String,String), Vec<Submission>>` build at L338). Because the sidecar is reachable from the docker bridge and the auth token is the only gate, a missing/leaked token turns this into a fleet-wide CPU DoS vector.

**Severity:** High
**Confidence:** High
**Fix:**
1. Enforce the cap at the sidecar boundary in `main.rs` `compute`: `if submissions.len() > MAX_SUBMISSIONS { return StatusCode::PAYLOAD_TOO_LARGE }` with `const MAX_SUBMISSIONS: usize = 500` (mirror the TS constant).
2. In `runSimilarityCheck` (TS), apply `MAX_SUBMISSIONS_FOR_SIMILARITY` to `rows.length` **before** calling `computeSimilarityRust`, returning `not_run / too_many_submissions` so the sidecar never receives an oversized payload.
3. Optional: stream `compute_similarity` results via an `mpsc` channel so a long-running scan does not have to fully materialize `pairs: Vec<SimilarityPair>` before returning.

---

### PERF-3 — Shared SSE slot acquisition serializes on one global advisory lock

**File:** `src/lib/realtime/realtime-coordination.ts` L73–140
**Scenario:** Every `acquireSharedSseConnectionSlot` call wraps four SQL statements inside `withPgAdvisoryLock("realtime:sse:acquire", ...)`:

- `DELETE` stale SSE rows (L104–109)
- `SELECT count(*), count(*) filter (...)` (L111–122)
- `INSERT` the new slot (L132–136)

The advisory lock key is the **literal string** `"realtime:sse:acquire"` (L101) — every connection request across every user contends on the same lock. Under a reconnect storm (deploy, network blip, browser refresh wave), hundreds of concurrent acquires queue serially; each holds the lock across four round-trips inside one transaction.

The DELETE and the count both use `${realtimeCoordination.key} LIKE ${getSsePrefixPattern()} ESCAPE '\\'` (`realtime:sse:user:%`). The PK on `key` is a btree so prefix-LIKE is index-scannable, but the count still walks every live SSE row on every acquire.

**Impact:** Throughput ceiling for SSE connection setup ≈ `1 / (4 × RTT)` per core. With ~1 ms RTT to PG that is ~250 acquires/sec — fine at steady state, but a reconnect burst stalls new SSE setups for seconds, exactly when users are waiting for live verdicts. The DELETE is run on every acquire too, so churn makes it worse.

**Severity:** High
**Confidence:** High
**Fix:**
1. Move the stale-row cleanup **out** of the acquire path — the existing `shouldRecordSharedHeartbeat` path already deletes stale heartbeats; add a similar unlinked periodic sweep (or a cron `DELETE ... WHERE expires_at < NOW()` on a 30 s timer).
2. Replace the global lock with a sharded counter: hash the user id to one of N buckets (e.g. 16) and lock the bucket, not the fleet. Per-user cap already requires per-user counting; a per-bucket `count(*) filter (where key like 'realtime:sse:user:' || user_hash_prefix)` is enough for the global cap if N is sized to `max_global / target_concurrency`.
3. Cache `count(*)` for the global cap with a short TTL (1 s) and accept ±N jitter — connections are soft-capped anyway.

---

### PERF-4 — Rankings page runs the `first_accepts` CTE three times per render

**File:** `src/app/(public)/rankings/page.tsx` L59–78 (metadata), L141–149 (estimated user count), L157–198 (actual ranking)
**Scenario:** A single GET `/rankings?page=N&pageSize=M` triggers:

1. `generateMetadata` (L46): a `first_accepts` CTE that groups **all** `submissions WHERE status='accepted'` by `(user_id, problem_id)` and counts distinct users — full scan of accepted submissions.
2. Page body (L141): a separate `estimatedCountRow` query that re-counts users with a different `NOT EXISTS` shape.
3. Page body (L167): the same `first_accepts` CTE recomputed inside the ranking SELECT, then joined to `users`, with `COUNT(*) OVER()` for pagination total.

The `first_accepts` CTE has no period filter on the metadata/estimate queries (it filters all accepted submissions ever). The only supporting index is `submissions_status_idx` on `(status)` — a single-column index that returns every accepted row, which PG then hashes/groups in memory.

**Impact:** For a site with 100 k+ accepted submissions, each `/rankings` page load does ~2 full scans + 1 large hash aggregate of the accepted-submissions set. Under anonymous traffic this is a public, cacheable URL but there is no `Cache-Control` / `revalidate` time on the route segment, so every page render hits the DB. Metadata runs concurrently with the page body, but the page body itself does two queries serially (L141 then L167).

**Severity:** Medium
**Confidence:** High
**Fix:**
1. Add `export const revalidate = 60` (or `export const dynamic = "force-static"` with ISR) on the rankings route — public leaderboard data does not need to be fresher than 1 minute.
2. Drop the L141 `estimatedCountRow` query entirely; the L167 query already returns `COUNT(*) OVER() as total` — reuse it to clamp `currentPage`, and only fall back to the estimate when the requested offset is past the last page (the same pattern `submissions/page.tsx` already uses at L256–270).
3. Make `generateMetadata` not run the heavy CTE: derive the page title from the search params only (the title only needs the page number, not the total — L84–90 already tolerate `total = 0`).
4. Longer term: maintain a `user_solved_counts(user_id, problem_id, first_accepted_at)` summary table updated by the judge-poll path on terminal `accepted`, and have the rankings query read from it.

---

### PERF-5 — Contest announcements endpoint returns every row with no pagination

**File:** `src/app/api/v1/contests/[assignmentId]/announcements/route.ts` L49–54
**Scenario:** `GET /api/v1/contests/:assignmentId/announcements` calls `db.query.contestAnnouncements.findMany({ where: eq(...assignmentId), orderBy: [desc(isPinned), desc(createdAt)] })` with **no `limit`/`offset`**. The supporting index `contest_announcements_assignment_idx` (schema L762) is single-column on `assignmentId`.

**Impact:** A long-running contest that posts an announcement per day accumulates hundreds of rows; each fetch serializes the full `content` markdown. The endpoint is hit by every enrolled student + every access-token holder on every contest page load, and is rate-limited (`contests:announcements`) but not bounded.

**Severity:** Medium
**Confidence:** High
**Fix:** Add `parsePagination(req.nextUrl.searchParams, { defaultLimit: 50, maxLimit: 200 })` and pass `limit`/`offset` to `findMany`, returning `apiPaginated(...)`. UI already paginates contest clarifications list; mirror that.

---

### PERF-6 — Contest clarifications endpoint returns every row with no pagination

**File:** `src/app/api/v1/contests/[assignmentId]/clarifications/route.ts` L49–58
**Scenario:** Identical to PERF-5: `findMany` with no `limit`, then a `.filter(...)` in JS for non-managers (L54–56) that materializes every row in memory before filtering. Index `contest_clarifications_assignment_idx` (schema L794) covers the WHERE but not the volume.

**Impact:** A contest with thousands of student questions scales the response payload and the in-memory filter linearly. Worse, the JS filter on L56 means **every row's `userId`, `isPublic`, and `answer` fields are transferred from PG before filtering**, even though a non-manager viewer is only allowed to see their own + public-answered rows.

**Severity:** Medium
**Confidence:** High
**Fix:** Push the visibility predicate into SQL: for non-managers, `WHERE assignmentId = ? AND (userId = ? OR (isPublic = TRUE AND answer IS NOT NULL))`. Add pagination. The `contest_clarifications_assignment_idx` could be widened to `(assignmentId, createdAt)` to support the `ORDER BY answeredAt DESC, createdAt DESC` plan.

---

### PERF-7 — Submission POST counts global pending queue under a per-user advisory lock

**File:** `src/app/api/v1/submissions/route.ts` L345–393
**Scenario:** `execTransaction(async (tx) => { await pg_advisory_xact_lock(hashtextextended(user.id)); ... })` holds a per-user transaction across four statements: recent-submissions count, user pending count, **global** pending/queued count, exam-session check, insert. The global count:

```ts
.select({ count: sql<number>`COUNT(*)` })
.from(submissions)
.where(sql`${submissions.status} IN ('pending', 'queued')`)
```

(L385–388) has no other predicate. `submissions_queue_claim_idx(status, submitted_at, id)` lets PG use two index-only scans (one per status), but it still counts **every** queued row in the system on **every** submission POST — under the per-user lock.

**Impact:** At submission burst time (deadline rush), this count runs on every POST. With 10 k pending submissions and 50 concurrent submitters, each submitter's transaction holds the per-user advisory lock for the duration of this scan, and the global scan cost grows with queue depth — exactly when the queue is deepest. The global cap (`submissionGlobalQueueLimit`, default 100) is small, so the count rarely trips, but the query still does the full scan to compute it.

**Severity:** Medium
**Confidence:** High
**Fix:**
1. Move the global-cap check **outside** the per-user transaction — it does not need to be consistent with the insert (off by one is acceptable for a soft cap). Run it before acquiring the advisory lock and short-circuit on `judgeQueueFull` without ever taking the lock.
2. Maintain a cheap `judge_queue_depth` counter (e.g. a single-row `system_state` row updated by judge `claim`/`poll`, or a `pg_advisory_lock`-free `SELECT count(*) FROM submissions WHERE status='pending' LIMIT 1` existence check if the cap is not exact).

---

### PERF-8 — Missing index for realtime_coordination prefix-LIKE scans

**File:** `src/lib/db/schema.pg.ts` L669–680; consumers in `src/lib/realtime/realtime-coordination.ts` L104–122, L193–199
**Scenario:** The table's only index is `realtime_coordination_expires_at_idx` on `expiresAt`. The hot-path queries filter with:

- `WHERE key LIKE 'realtime:sse:user:%' ESCAPE '\\' AND expiresAt >= now` (acquire slot, L106, L119)
- `WHERE key LIKE 'realtime:heartbeat:%' ESCAPE '\\' AND expiresAt < now - interval` (heartbeat cleanup, L196)

PostgreSQL can use the PK btree on `key` for an unanchored prefix LIKE, but the planner picks between the PK and the expires-index depending on selectivity. When most rows are live (steady state), neither index is highly selective on its own and PG often falls back to a seq scan over the small table.

**Impact:** The realtime coordination table is small (capped by SSE connection limits) so a seq scan is cheap today, but the scan cost grows linearly with global connection count. Under PERF-3's reconnect-storm scenario, the count query's seq scan stacks on top of the global advisory lock contention, multiplying latency.

**Severity:** Medium
**Confidence:** Medium (planner behavior depends on table stats; would benefit from `EXPLAIN ANALYZE` on a populated table)
**Fix:** Add a BTREE index on `(key)` (text PK already gives this; what's missing is a composite that lets PG satisfy both predicates from one index). The cleanest is a partial index keyed on the prefix:

```ts
index("realtime_coordination_key_idx").on(table.key)
// and a partial index for the SSE-slot count hot path:
index("realtime_coordination_sse_idx")
  .on(table.key)
  .where(sql`${table.key} LIKE 'realtime:sse:user:%'`)
```

Actually simpler — add a `category` column derived from the key prefix and index `(category, expiresAt)`. That also lets the heartbeat path avoid a LIKE entirely.

---

### PERF-9 — Admin audit-logs route materializes all instructor submission IDs in one IN-array

**File:** `src/app/api/v1/admin/audit-logs/route.ts` L73–105
**Scenario:** For instructor viewers, the scope filter pipeline is:

1. `findMany(groups where instructorId = user.id)` → `groupIds`
2. `findMany(assignments where groupId IN groupIds)` → `assignmentIds`
3. `findMany(submissions where assignmentId IN assignmentIds)` → `submissionIds` (columns: `id`)
4. `findMany(problems where authorId = user.id)` → `problemIds`

Then the main query filters with `inArray(auditEvents.resourceId, submissionIds)` — for a long-tenured instructor this list can reach thousands of submission IDs. PG's `IN (...)` parsing cost is O(N) per query, and the same list is rebuilt on every page navigation.

**Impact:** N+1-style cost on every audit-log page load. The four prefetched `findMany` calls themselves are indexed (each has a backing index), but the resulting `IN` array can balloon to a planning penalty and a large SQL text payload (a 5 000-element IN list is ~200 KB of SQL).

**Severity:** Medium
**Confidence:** High
**Fix:** Replace the precomputed `IN` arrays with `EXISTS` subqueries in the main audit-events WHERE clause — `EXISTS (SELECT 1 FROM submissions s JOIN assignments a ... WHERE s.id = audit.resourceId AND a.instructor_id = :user)`. PG plans this once and the cost is bounded by the audit-events index, not the submission count. If that's too slow, materialize a `instructor_visible_resources(user_id, resource_type, resource_id)` view refreshed by trigger.

---

### PERF-10 — `getDbNowUncached` does a SELECT NOW() on every hot-path call

**File:** `src/lib/db-time.ts` L33–39; called from `judge/claim/route.ts` L216, `judge/poll/route.ts` L79 & L146, `realtime-coordination.ts` L98 & L160, `submissions/route.ts` L342, `queue-status/route.ts`, `contests/stats/route.ts` L143 & L222, `code-similarity.ts` L418, etc.
**Scenario:** `getDbNowUncached` is intentionally not cached (it's the "I really need fresh DB time" variant), but every caller in a transactional path already has a transaction context whose `NOW()` is fixed at START TRANSACTION — the extra round-trip adds nothing but latency.

In `judge/poll/route.ts` final path, `judgedAt = await getDbNowUncached()` (L146) is fetched, then the transaction at L150 sets `judgedAt` from the JS variable — even though `tx` could just use `NOW()` inline and avoid the round-trip.

In `realtime-coordination.ts` `acquireSharedSseConnectionSlot`, `getDbNowUncached()` at L98 is one extra round-trip outside the advisory-lock transaction, then `nowMs` is used as a JS parameter inside the transaction — the same effect could be had from `NOW()` in the WHERE clauses for free.

**Impact:** Two classes: (a) inside a transaction, a redundant round-trip that could be `NOW()` in SQL — adds ~1 ms × frequency. The judge `claim` and `poll` paths together process every submission, so this is a steady per-judgment cost. (b) Outside a transaction (the contest-stats cache-write timestamp), it's a true extra round-trip.

**Severity:** Low
**Confidence:** High
**Fix:** In transactional callers, replace `await getDbNowUncached()` + JS parameter binding with SQL `NOW()` (or `CLOCK_TIMESTAMP()` if true wall-clock is required). Reserve `getDbNowUncached` for non-transactional paths. This also closes a tiny skew window between the JS timestamp and the transaction's own `NOW()`.

---

### PERF-11 — `runDocker` adds up to ~600 ms of inspect-retry latency to every compiler run

**File:** `src/lib/compiler/execute.ts` L481–488
**Scenario:** After every `docker run` exits (success or timeout), `inspectContainerState` is called and, if the run was killed, retried up to 3 times with `setTimeout(200ms)` between attempts. The retry only short-circuits when `state.oomKilled` becomes true — if the kill was a plain timeout (no OOM), all 3 retries run before giving up. Each retry is itself an `execFile("docker", [...])` with a 5 s timeout.

**Impact:** On the local-fallback path (no Rust runner configured), every successful run pays one `docker inspect` round-trip (~50–100 ms locally). Every timeout-OOM race pays 3 × (200 ms + inspect) ≈ 750 ms. The `executionLimiter` (pLimit `cpus() - 1`) gates concurrent containers, so this latency serializes through the same concurrency gate — reducing effective compiler throughput on small instances.

**Severity:** Low
**Confidence:** Medium (the retry is intentional — it disambiguates OOM vs timeout; the fix is to cap retry count or move inspect off the pLimit critical path)
**Fix:** Move the post-run `inspectContainerState` calls **out** of the `executionLimiter` critical section (run cleanup/inspect after releasing the concurrency slot), and reduce the retry budget for the no-OOM case (if the first inspect shows a clean exit code, skip retries entirely).

---

### PERF-12 — Worker staleness sweep runs both inline on every heartbeat and on a 60 s interval

**File:** `src/lib/judge/worker-staleness-sweep.ts` L41–107; `src/app/api/v1/judge/heartbeat/route.ts` (inline caller)
**Scenario:** `sweepStaleWorkers` is invoked from the heartbeat route (every worker, every poll interval) **and** from a process-level `setInterval(60_000)` (L101). Each sweep does two `UPDATE ... WHERE status='online' AND last_heartbeat_at < cutoff RETURNING id` and `UPDATE ... WHERE status='stale' AND ... RETURNING id` — both with `.returning()`, both write-yielding-WAL even when 0 rows match.

With one worker heartbeating every 5 s, the inline sweep alone fires 12 × more often than the background sweep. The `judge_workers_status_idx` (schema L454) and `judge_workers_last_heartbeat_idx` (L455) cover the scans, so the cost is small per call, but it is unnecessary write traffic.

**Impact:** 12 redundant sweeps/minute/worker. On a fleet of 10 workers heartbeating every 5 s, that's 120 sweeps/min, mostly no-ops but each generating an `UPDATE ... RETURNING` that the DB must plan and execute. Low individual cost, but it's pure overhead.

**Severity:** Low
**Confidence:** High
**Fix:** Make the heartbeat-path sweep **conditional**: only run it if `(now - lastSweepAt) > 30s` (a process-local timestamp). The background interval remains the safety net for the no-heartbeat case. Or drop the inline call entirely and rely on the 60 s background sweep plus tightening the threshold.

---

### PERF-13 — `includeSummary=1` on submissions list adds a second GROUP BY query

**File:** `src/app/api/v1/submissions/route.ts` L181–201
**Scenario:** When `?includeSummary=1` is passed, after the main paginated SELECT (which already carries `COUNT(*) OVER()` for the total), the handler issues a second `GROUP BY status` aggregate over the **same** `whereClause`. The `submissions_status_idx` (single-column) supports the group key, but the query still scans every matching row to group them.

**Impact:** Doubles the per-page DB cost when the UI asks for the status summary. The `submissions_user_status_idx(userId, status)` partially covers the common student-scope case but not the staff (`view_all`) case.

**Severity:** Low
**Confidence:** High
**Fix:** Compute the summary in the same query using a CTE: `WITH page AS (...), summary AS (SELECT status, count(*) FROM submissions WHERE <filters> GROUP BY status) SELECT ... FROM page, summary`. Or precompute a `submission_status_summary` rollup refreshed by trigger / judge-poll.

---

### PERF-14 — SSE shared-poll interval default (2 s) × connection cap (500) = steady DB tick load

**File:** `src/app/api/v1/submissions/[id]/events/route.ts` L211–221; `src/lib/system-settings-config.ts` L29 (`ssePollIntervalMs: 2_000`); `MAX_GLOBAL_SSE_CONNECTIONS = 500` L31
**Scenario:** A single `setInterval(sharedPollTick, ssePollIntervalMs)` batches all subscribed submission IDs into one `SELECT ... WHERE id IN (...)` per tick. The batch is good, but at the cap of 500 connections (each typically watching one submission) the query is `IN (≤500 ids)` every 2 s — ~250 such queries/sec at saturation, plus per-tick callback dispatch to every subscriber.

The poll runs unconditionally even when no verdict has changed (no comparison against a last-known status short-circuit at the SQL layer — every row's status is read and dispatched, then each connection's `onPollResult` compares against `IN_PROGRESS_JUDGE_STATUSES`).

**Impact:** Steady-state ~250 queries/sec just to back the SSE channel. Each is small and indexed by PK, but it is the dominant DB load on a quiet site at full SSE capacity. Also: every callback fires `getApiUser(request)` every 30 s per connection (the `AUTH_RECHECK_INTERVAL_MS` path), which is a session DB lookup per SSE connection per 30 s.

**Severity:** Low
**Confidence:** High
**Fix:**
1. Make the poll **status-change-driven**: add `AND status != $last_status_per_id` to the batched query, or only dispatch callbacks whose status changed (the current code dispatches unchanged statuses too — `cb(status)` is called every tick).
2. Default `ssePollIntervalMs` to 3–5 s for non-edge deployments; the UX is still "live" enough.
3. Consider LISTEN/NOTIFY: judge `poll/route.ts` already finalizes submissions — emit `pg_notify('submission_status', id)` there and have one SSE-listener process forward to all subscribers, eliminating the polling tick entirely.

---

### PERF-15 — Cleanup `BATCH_SIZE = 5000` with `DELETE ... WHERE id IN (SELECT ... LIMIT 5000)`

**File:** `src/lib/db/cleanup.ts` L8, L46–53, L56–63
**Scenario:** The retention delete batches 5 000 rows per iteration with a 100 ms delay between batches. The inner `SELECT id FROM audit_events WHERE created_at < cutoff LIMIT 5000` is index-backed (`audit_events_created_at_idx`), but the outer `DELETE FROM audit_events WHERE id IN (...)` acquires row-level locks on 5 000 rows in one statement, holding them until the statement commits.

**Impact:** For a deployment that retains only 30 days of audit events but accumulates millions of rows before the first cleanup, the first invocation runs many batches back-to-back, each holding 5 000 row locks briefly. Other transactions writing to `audit_events` (which is every API request via `recordAuditEvent`) can block momentarily per batch. Not severe because each batch commits independently, but the 100 ms delay × N batches extends total runtime.

**Severity:** Low
**Confidence:** Medium
**Fix:** Smaller batches (1 000) with a slightly longer delay (200 ms) reduces per-batch lock footprint. Or partition `audit_events` by month and drop old partitions instead of row-by-row deletes.

---

## Cross-cutting observations (no separate ID, no action expected)

- **`pg_advisory_xact_lock(hashtextextended(${user.id}, 0))`** in `submissions/route.ts` L349 — the right pattern for serializing per-user submission rate checks. `hashtextextended` (PG 14+) gives a 64-bit hash space; collision probability across active users is negligible. Note that two users whose hashes collide would serialize unnecessarily, but the cost is one transaction's worth of latency, not a correctness bug.
- **`getDbNow` (React-cached variant)** correctly dedupes within a single server render — server components that call it multiple times in one request pay one round-trip. Good.
- **Cursor pagination** in `submissions/route.ts` L55–138 is correctly implemented with `(submittedAt, id)` tuple comparison, base64-encoded cursor carrying both fields, and `LIMIT+1` for `hasMore` detection. No N+1 on cursor lookup for the new format; only the backward-compat branch at L80 does an extra `findFirst` (acceptable for legacy cursors).
- **`parseCursorParams` / `parsePagination`** cap `limit` server-side, so the list endpoints cannot be made to scan unbounded pages by a client.
- **Stream export** (`src/lib/db/export.ts`) uses `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY` and respects backpressure via `waitForReadableStreamDemand` — the design is sound; only the backup-with-files layer (PERF-1) breaks the streaming contract.

---

## Priority order for remediation

1. **PERF-1** (backup memory) — fixes a real OOM risk on the live app process.
2. **PERF-2** (similarity sidecar) — fixes a CPU/OOM DoS on a docker-network-reachable service.
3. **PERF-3** (SSE advisory lock) — fixes reconnect-storm latency for the live-verdict UX.
4. **PERF-4** (rankings CTE × 3) — public-page DB load multiplier.
5. **PERF-5/6/7** — straightforward pagination/cap additions.
6. The Low-severity items can be batched into a single cleanup PR.
