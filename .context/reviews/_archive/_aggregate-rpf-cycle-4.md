# Aggregate Review — Cycle 4 (2026-05-01 RPF loop)

**Date:** 2026-05-01
**Reviewers:** comprehensive-reviewer (fresh pass)
**Total findings:** 4 new (1 MEDIUM, 3 LOW) + 0 false positives + prior cycle findings confirmed fixed + deferred re-validated

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] `data-retention-maintenance.ts` `stopSensitiveDataPruning()` does not clear `globalThis.__sensitiveDataPruneTimer`

**Sources:** NEW-1 | **Confidence:** HIGH

`src/lib/data-retention-maintenance.ts:108-127` — `startSensitiveDataPruning()` stores the interval reference in both `globalThis.__sensitiveDataPruneTimer` (for cross-HMR deduplication) and the module-level `pruneTimer` variable. However, `stopSensitiveDataPruning()` only clears `pruneTimer` and does not clear `globalThis.__sensitiveDataPruneTimer`. After stopping, the global variable still holds the old cleared interval ID, which could mislead monitoring code or future `startSensitiveDataPruning()` calls that check the global before clearing.

**Concrete failure scenario:** A monitoring endpoint checks `globalThis.__sensitiveDataPruneTimer` to report whether data retention pruning is active. After `stopSensitiveDataPruning()`, the global still holds a truthy value, causing a false "active" report.

**Fix:** Add `globalThis.__sensitiveDataPruneTimer = undefined;` inside `stopSensitiveDataPruning()`.

---

### AGG-2: [LOW] `countdown-timer.tsx` fires threshold toasts in burst when tab regains focus

**Sources:** NEW-2 | **Confidence:** MEDIUM

`src/components/exam/countdown-timer.tsx:100-112` — When a browser tab is backgrounded, `setTimeout` is throttled. On tab focus restoration, `handleVisibilityChange` calls `recalculate()`, which processes all pending thresholds in rapid succession. The `firedThresholds` ref prevents duplicates for the same threshold, but multiple different thresholds fire simultaneously (e.g., 15-min + 5-min + 1-min warnings all at once), creating an unreadable burst of overlapping toasts.

**Concrete failure scenario:** A student backgrounds the exam tab for 10 minutes. On return at the 4-minute mark, they simultaneously get 15-minute, 5-minute, and potentially 1-minute warning toasts in a burst they cannot read.

**Fix:** In the `handleVisibilityChange` callback, stagger threshold toast emissions with 2-second delays between each.

---

### AGG-3: [LOW] `batchedDelete` uses PostgreSQL-specific `ctid` without documentation

**Sources:** NEW-3 | **Confidence:** LOW

`src/lib/data-retention-maintenance.ts:22-32` — The `batchedDelete` function uses `ctid` (PostgreSQL physical row identifier) for batched deletes. The codebase documents PostgreSQL as the runtime DB, but the `ctid` dependency is an implementation detail that would silently break on any other database. Worth documenting for maintainers.

**Concrete failure scenario:** A developer refactors the data layer for MySQL. The `ctid`-based delete produces a syntax error instead of batching, potentially causing a full-table lock.

**Fix:** Add a JSDoc comment on `batchedDelete` noting the PostgreSQL-specific `ctid` optimization and that an alternative approach would be needed for other databases.

---

### AGG-4: [LOW] `apiFetch` client does not set `Accept: application/json` header

**Sources:** NEW-4 | **Confidence:** LOW

`src/lib/api/client.ts` — The `apiFetch` helper does not set an `Accept: application/json` header. When the backend returns an HTML error page (e.g., from nginx), the client gets an unhelpful `JSON.parse` error ("Unexpected token <") instead of a descriptive message about the proxy returning HTML.

**Concrete failure scenario:** The nginx reverse proxy returns a 502 HTML page. The client code tries `await res.json()` and gets a SyntaxError. The developer sees "Unexpected token <" instead of "Server returned HTML instead of JSON".

**Fix:** Set `Accept: application/json` in default headers. In the error path, check `content-type` and provide a descriptive error for non-JSON responses.

---

## Previously Fixed Items (confirmed in current code)

All prior cycle fixes verified:
- Cycle 3: `participant-status.ts` null status returns "pending"
- Cycle 3: `scoring.ts` SQL column name validation
- Cycle 3: `in-memory-rate-limit.ts` BACKOFF_CAP = 5
- Cycle 3: Unit tests for in-memory rate limiter
- Cycle 2: `analytics/route.ts` thundering-herd fix
- Cycle 2: `contest-scoring.ts` Date.now() fallback in catch
- Earlier: `proxy.ts` uses dynamic cookie names
- Earlier: anti-cheat retry scheduling consolidated
- Earlier: DEFER-29 resolved (all API routes now use `createApiHandler`)

---

## Carried Deferred Items (unchanged from cycle 48)

- DEFER-22: `.json()` before `response.ok` — 60+ instances
- DEFER-23: Raw API error strings without translation — partially fixed
- DEFER-24: `migrate/import` unsafe casts — Zod validation not yet built
- DEFER-27: Missing AbortController on polling fetches
- DEFER-28: `as { error?: string }` pattern — 22+ instances
- DEFER-30: Recruiting validate token brute-force
- DEFER-32: Admin settings exposes DB host/port
- DEFER-33: Missing error boundaries — contests segment now fixed
- DEFER-34: Hardcoded English fallback strings
- DEFER-35: Hardcoded English strings in editor title attributes
- DEFER-36: `formData.get()` cast assertions
- DEFER-43: Docker client leaks `err.message` in build responses (addressed by cycle 39 AGG-1)
- DEFER-44: No documentation for timer pattern convention
- DEFER-45: Anti-cheat monitor captures user text snippets (design decision — partially fixed in cycle 38)
- DEFER-46: `error.message` as control-flow discriminator across 15+ API catch blocks
- DEFER-47: Import route JSON path uses unsafe `as JudgeKitExport` cast
- DEFER-48: CountdownTimer initial render uses uncorrected client time
- DEFER-49: SSE connection tracking uses O(n) scan for oldest-entry eviction
- DEFER-50: [LOW] `in-memory-rate-limit.ts` `maybeEvict` triggers on every rate-limit call
- DEFER-51: [LOW] `contest-scoring.ts` ranking cache mixes `Date.now()` staleness check with `getDbNowMs()` writes
- DEFER-52: [LOW] `buildDockerImageLocal` accumulates stdout/stderr up to 2MB with string slicing (partially addressed by cycle 45 AGG-2 head+tail)
- DEFER-53: [LOW] `in-memory-rate-limit.ts` `maybeEvict` double-scans expired entries on capacity overflow (addressed by cycle 45 AGG-1 single-pass)
- DEFER-54: [LOW] `recruiting/request-cache.ts` `setCachedRecruitingContext` mutates ALS store without userId match check
- DEFER-55: [LOW] `countdown-timer.tsx` no retry on server time fetch failure
- DEFER-56: [LOW] `similarity-check/route.ts` fragile `AbortError` detection
- DEFER-57: [LOW] `image-processing.ts` `MAX_INPUT_BUFFER_BYTES` is not configurable (cycle 47 new)

---

## No Agent Failures

The comprehensive review completed successfully.
