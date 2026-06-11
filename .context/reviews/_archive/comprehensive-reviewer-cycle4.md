# Comprehensive Deep Code Review — Cycle 4

**Date:** 2026-05-01
**Reviewer:** comprehensive-reviewer
**Scope:** Full repository, all source files, cross-file interactions
**Prior cycles reviewed:** Cycles 1-48 aggregate reviews; cycle 1-3 RPF plan outcomes

---

## Review Methodology

1. Built inventory of all source directories and files (567 TypeScript/TSX files across 100+ directories)
2. Examined critical security-sensitive paths: proxy.ts, auth/, security/, scoring.ts, compiler/execute.ts
3. Reviewed all prior aggregate reviews and deferred items
4. Searched for common issue patterns: SQL injection, XSS, race conditions, error handling, timer leaks, env validation, empty catches, control-flow discriminators
5. Verified previously fixed items remain in place
6. Performed final sweep for commonly missed issues

---

## New Findings

### NEW-1: [MEDIUM] `data-retention-maintenance.ts` uses `globalThis.__sensitiveDataPruneTimer` for deduplication but `stopSensitiveDataPruning()` only clears the local `pruneTimer` variable

**Files:** `src/lib/data-retention-maintenance.ts:108-127`
**Confidence:** HIGH

`startSensitiveDataPruning()` stores the interval reference in both `globalThis.__sensitiveDataPruneTimer` (for cross-HMR deduplication) and the module-level `pruneTimer` (for the stop function). However, `stopSensitiveDataPruning()` only clears `pruneTimer` and does not clear `globalThis.__sensitiveDataPruneTimer`. This means:

1. After calling `stopSensitiveDataPruning()`, `globalThis.__sensitiveDataPruneTimer` still holds the now-cleared interval ID.
2. If `startSensitiveDataPruning()` is called again after stop, the `if (globalThis.__sensitiveDataPruneTimer) clearInterval(globalThis.__sensitiveDataPruneTimer)` line clears an already-cleared interval ID (harmless but wasteful), and then `globalThis.__sensitiveDataPruneTimer` is overwritten with a new interval.

The real risk: in Next.js HMR, if a module is replaced, `stopSensitiveDataPruning()` from the OLD module clears the old `pruneTimer` but the global variable still points to it. The NEW module's `startSensitiveDataPruning()` then correctly clears it via the global check. This is actually safe in practice because of the `clearInterval(globalThis.__sensitiveDataPruneTimer)` guard at the top of `startSensitiveDataPruning()`.

However, `stopSensitiveDataPruning()` should also clear `globalThis.__sensitiveDataPruneTimer = undefined` for consistency, so that external callers checking the global can tell pruning is stopped.

**Concrete failure scenario:** A monitoring endpoint checks `globalThis.__sensitiveDataPruneTimer` to determine if data retention pruning is active. After `stopSensitiveDataPruning()`, the global still holds the old timer ID, leading to a false "active" report.

**Fix:** Add `globalThis.__sensitiveDataPruneTimer = undefined;` inside `stopSensitiveDataPruning()`.

---

### NEW-2: [LOW] `countdown-timer.tsx` fires threshold toasts even when the tab is in the background

**Files:** `src/components/exam/countdown-timer.tsx:100-112`
**Confidence:** MEDIUM

When the browser tab is in the background, `setTimeout` may be throttled (most browsers throttle to 1/sec or worse). When the tab regains focus, the `handleVisibilityChange` listener calls `recalculate()`, which processes all pending thresholds in rapid succession. This causes multiple toast notifications to fire simultaneously — e.g., both the 15-minute and 5-minute warnings could appear at the same time if the tab was backgrounded for 10+ minutes.

While the `firedThresholds` ref correctly prevents duplicate threshold firings for the same threshold, the UX issue is that the student sees a burst of overlapping toasts that they cannot read individually. This is especially problematic during exams where these warnings are important.

**Concrete failure scenario:** A student works on an exam in one browser tab while reading problem descriptions in another. When they return to the exam tab at the 4-minute mark, they simultaneously get the 15-minute warning toast, the 5-minute warning toast, and potentially the 1-minute warning toast in a burst.

**Fix:** In the `handleVisibilityChange` callback, batch-fire threshold toasts with a staggered delay (e.g., 2 seconds between each toast) instead of processing all thresholds in a single synchronous `recalculate()` call.

---

### NEW-3: [LOW] `batchedDelete` in `data-retention-maintenance.ts` uses `ctid` which is PostgreSQL-specific and not portable

**Files:** `src/lib/data-retention-maintenance.ts:22-32`
**Confidence:** LOW

The `batchedDelete` function uses `ctid` (PostgreSQL's physical row identifier) for batched deletes: `DELETE FROM ${table} WHERE ctid IN (SELECT ctid FROM ${table} WHERE ${whereClause} LIMIT ${BATCH_SIZE})`. The codebase already has legacy SQLite/MySQL schema artifacts (noted in `AGENTS.md`), and while the runtime is PostgreSQL-only, the `ctid` approach is a PostgreSQL implementation detail that would break if the project ever needed to support another database.

The `AGENTS.md` says: "PostgreSQL 18 runtime" and "Drizzle ORM with PostgreSQL runtime schema", so this is a very low risk. However, it is worth documenting as a PostgreSQL-specific optimization for future maintainers.

**Concrete failure scenario:** A developer refactors the import/export system to support MySQL. The `ctid`-based delete silently produces a syntax error on MySQL instead of deleting in batches, potentially causing a full-table delete that locks the database.

**Fix:** Add a JSDoc comment on `batchedDelete` noting the `ctid` dependency on PostgreSQL and that an alternative approach (e.g., `DELETE ... WHERE id IN (SELECT id ...)`) would be needed for other databases.

---

### NEW-4: [LOW] `apiFetch` client does not set an `Accept: application/json` header

**Files:** `src/lib/api/client.ts`
**Confidence:** LOW

The `apiFetch` helper does not set an `Accept: application/json` header. When the backend returns an HTML error page (e.g., from nginx or a misconfigured reverse proxy), the client attempts to parse it as JSON and gets a parse error. The error message from `JSON.parse` is unhelpful ("Unexpected token <") and obscures the actual problem.

This is a minor DX/observability issue, not a correctness bug — the client already handles parse errors by returning `{ data: null }` or throwing.

**Concrete failure scenario:** The nginx reverse proxy returns a 502 HTML page. The client code tries `await res.json()` and gets a SyntaxError. The developer sees "Unexpected token <" instead of "Server returned HTML instead of JSON (likely a proxy error)".

**Fix:** Set `Accept: application/json` in the default headers of `apiFetch`. In the error path, check `res.headers.get("content-type")` and provide a more descriptive error when the response is not JSON.

---

## Previously Fixed Items (Re-verified)

All cycle-3 fixes confirmed still in place:
- `participant-status.ts` null status returns "pending" (commit e9cfb762)
- `scoring.ts` SQL column name validation with dual-regex (commit 3e075be8)
- `in-memory-rate-limit.ts` BACKOFF_CAP = 5 (commit ab336b0a)
- Unit tests for in-memory rate limiter (commit f276dd64)

All prior-cycle fixes confirmed:
- `analytics/route.ts` thundering-herd fix (Date.now() for staleness, try-catch for getDbNowMs failure)
- `contest-scoring.ts` Date.now() fallback in catch block
- `proxy.ts` uses `getAuthSessionCookieNames()` for dynamic cookie names (not hardcoded)
- `anti-cheat-monitor.tsx` retry scheduling consolidated via `scheduleRetryRef`
- HTML sanitization uses DOMPurify with allowlists
- All API routes use `createApiHandler`
- Circuit breaker in `rate-limiter-client.ts` properly documented as per-instance

---

## Deferred Items Re-validated

All carried deferred items from cycle 48 aggregate remain applicable:

| ID | Description | Status |
|----|-------------|--------|
| DEFER-22 | `.json()` before `response.ok` (60+ instances) | Still present, LOW priority |
| DEFER-23 | Raw API error strings without translation | Partially fixed |
| DEFER-24 | `migrate/import` unsafe casts | Not yet addressed |
| DEFER-27 | Missing AbortController on polling fetches | Still present |
| DEFER-28 | `as { error?: string }` pattern (22+ instances) | Still present |
| DEFER-29 | Admin routes bypass `createApiHandler` | **FIXED** — all routes now use createApiHandler |
| DEFER-30 | Recruiting validate token brute-force | Still present |
| DEFER-32 | Admin settings exposes DB host/port | Still present |
| DEFER-33 | Missing error boundaries | Contest segment fixed |
| DEFER-34 | Hardcoded English fallback strings | Still present |
| DEFER-35 | Hardcoded English strings in editor title attributes | Still present |
| DEFER-36 | `formData.get()` cast assertions | Still present |
| DEFER-43 | Docker client leaks `err.message` | Addressed by cycle 39 |
| DEFER-44 | No documentation for timer pattern convention | Still present |
| DEFER-45 | Anti-cheat captures user text snippets | Partially fixed |
| DEFER-46 | `error.message` as control-flow discriminator | Still present (5+ API routes) |
| DEFER-47 | Import route JSON path uses unsafe cast | Still present |
| DEFER-48 | CountdownTimer initial render uses uncorrected client time | Still present |
| DEFER-49 | SSE connection tracking O(n) scan | Still present |
| DEFER-50 | `in-memory-rate-limit.ts` maybeEvict triggers on every call | Partially addressed (single-pass) |
| DEFER-51 | `contest-scoring.ts` ranking cache Date.now()/getDbNowMs mix | Acknowledged tradeoff |
| DEFER-52 | `buildDockerImageLocal` stdout/stderr accumulation | Partially addressed (head+tail) |
| DEFER-53 | `in-memory-rate-limit.ts` double-scan on capacity overflow | Addressed (single-pass) |
| DEFER-54 | `request-cache.ts` mutates ALS without userId check | Still present |
| DEFER-55 | `countdown-timer.tsx` no retry on server time fetch failure | Still present |
| DEFER-56 | `similarity-check/route.ts` fragile AbortError detection | Still present |
| DEFER-57 | `image-processing.ts` MAX_INPUT_BUFFER_BYTES not configurable | Still present |

---

## Final Sweep: Commonly Missed Issues

1. **No unguarded `eval()` or `Function()` constructor** — confirmed absent
2. **No `Math.random()` used for security purposes** — confirmed (2 uses are for UI jitter only)
3. **No hardcoded credentials or API keys** — confirmed absent
4. **No `innerHTML` without sanitization** — `dangerouslySetInnerHTML` only used with `sanitizeHtml()` (DOMPurify)
5. **No unbounded recursion** — no recursive functions without depth limits found
6. **No file path traversal** — file upload paths are server-generated (nanoid-based)
7. **No open redirect** — `callbackUrl` validated by NextAuth
8. **Timer cleanup** — all `setTimeout`/`setInterval` calls have cleanup in `useEffect` returns or `finally` blocks
9. **Environment variable validation** — critical secrets validated with length and placeholder checks
10. **Circuit breaker** — properly documented as per-instance tradeoff
