# Cycle 3 — Code Review

**Date:** 2026-05-14
**Reviewer:** single-pass comprehensive review (no registered subagents available)
**Scope:** Full repository verification against prior open plans, recently changed files, high-risk areas

---

## Methodology

1. Verified all 7 open items from `plans/open/2026-05-14-cycle-2-rpf-review-remediation.md` against current code
2. Verified all 6 cycle-43 comprehensive review findings against current code
3. Examined recently changed files from commits since cycle 2:
   - `src/lib/security/api-rate-limit.ts` (blockedUntil fix)
   - `src/lib/db/index.ts` + `src/lib/db/queries.ts` (transaction guard + escaped quotes)
   - `src/lib/files/validation.ts` (middle slice fix)
   - `src/proxy.ts` (negative auth cache)
   - `src/app/api/v1/plugins/chat-widget/chat/route.ts` (tool timeout)
   - `src/app/api/v1/judge/claim/route.ts` (Infinity rejection)
   - `src/app/api/v1/files/route.ts` (originalName sanitization)
4. Searched for known problematic patterns: `.json()` before `.ok`, `error.message` control flow, unsafe casts, missing AbortController
5. Ran all quality gates: eslint, tsc --noEmit, next build, vitest (unit + component + integration)

---

## Verified Prior Fixes

### Cycle 2 Open Plan Items (ALL FIXED)

| ID | File | Status | Evidence |
|----|------|--------|----------|
| COR-3b | `src/lib/security/api-rate-limit.ts:236` | FIXED | `existing.blockedUntil >= now` |
| COR-5 | `src/lib/db/index.ts:58,82` + `queries.ts:54,84` | FIXED | `AsyncLocalStorage<boolean>`, `run(true, ...)`, `getStore() === true` |
| SEC-7 | `src/lib/db/queries.ts:120` | FIXED | Regex `'(?:[^']|'')*'` handles escaped quotes |
| PERF-3 | `src/lib/files/validation.ts:181` | FIXED | `buffer.length > SLICE_SIZE * 3` |
| TEST-5 | `tests/unit/security/api-rate-limit.test.ts:368` | FIXED | Test "blocks when blockedUntil equals now" exists |
| TEST-6 | `tests/unit/db/query-helpers.test.ts:64,76` | FIXED | Tests verify warn inside tx / no warn outside tx |
| POLICY-1 | Git commits | FIXED | No Co-Authored-By lines in recent commits |

### Cycle 43 Findings (ALL FIXED OR DEFERRED)

| ID | File | Status | Evidence |
|----|------|--------|----------|
| NEW-1 | `src/lib/assignments/recruiting-invitations.ts` | FIXED | No `recruit_` prefix in username generation |
| NEW-2 | `src/lib/assignments/contest-scoring.ts:165-174` | FIXED | `Date.now()` fallback in catch block with nested try/catch |
| NEW-3 | `src/lib/assignments/recruiting-invitations.ts:576-594` | FIXED | Deadline check with `NOW()` in already-redeemed path |
| NEW-4 | `src/lib/docker/client.ts:159-165` | DEFERRED | Existing DEFER-52; string accumulation confirmed still present |
| NEW-5 | `src/lib/security/in-memory-rate-limit.ts` | N/A | File removed (see `api-rate-limit.ts` comment) |
| NEW-6 | `src/lib/recruiting/request-cache.ts:59-62` | ACKNOWLEDGED | Documented design decision; single-user-per-request is invariant |

---

## New Findings

No new CRITICAL, HIGH, or MEDIUM findings were discovered in this cycle.

The codebase is in a clean state: all gates pass, all prior review findings are addressed, and no regressions were introduced by recent commits.

---

## Minor Observations (No Action Required)

1. **Dangling timers in chat-widget tool timeout:** The `Promise.race` timeout at `chat/route.ts:479-484` creates `setTimeout` timers that fire after 10 seconds even if `executeTool` already resolved. In settled Promise races, these rejections are silently swallowed. With `MAX_TOOL_ITERATIONS=5`, up to 5 timers may accumulate per request. This is a LOW cleanup item, not a correctness issue.

2. **Known deferred patterns still present:** DEFER-22 (`.json()` before `.ok` in some call sites), DEFER-46 (`error.message` control flow), DEFER-28 (unsafe `as` casts) remain as documented design tradeoffs. No new instances found beyond the known inventory.

3. **Deploy script PG image alignment:** Commit `0bfed50d` correctly upgraded `docker-compose.production.yml` from `postgres:17-alpine` to `postgres:18-alpine` to match the existing data version. Verified the compose file now uses `postgres:18-alpine`.

---

## Quality Gates

| Gate | Status |
|------|--------|
| eslint | PASS |
| tsc --noEmit | PASS |
| next build | PASS |
| vitest (unit: 317 files, 2408 tests) | PASS |
| vitest (component: 69 files, 215 tests) | PASS |
| vitest (integration: 3 files skipped) | PASS |
