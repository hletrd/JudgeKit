# RPF Cycle 43 — Review Remediation Plan

**Date:** 2026-04-23
**Cycle:** 43/100
**Base commit:** b0d843e7
**Status:** Done

## Lanes

### Lane 1: Replace `Date.now()` with `getDbNowUncached()` in submission rate-limit window [AGG-1]

**Severity:** MEDIUM/MEDIUM (9 of 11 perspectives)
**File:** `src/app/api/v1/submissions/route.ts:249,318`
**Status:** Done

**Tasks:**
- [x] Replace `new Date(Date.now() - 60_000)` at line 249 with `new Date((await getDbNowUncached()).getTime() - 60_000)`
- [x] Cache the `getDbNowUncached()` result and reuse it at line 318 for `submittedAt` (eliminates one redundant DB round-trip)
- [x] Add a comment explaining the use of DB time for rate-limit consistency
- [x] Verify TypeScript compiles without errors
- [x] Run existing tests to confirm no regressions
- [x] Commit with message: `fix(submissions): 🐛 use DB time for rate-limit window to avoid clock skew`

**Commit:** 1c5460bb

---

### Lane 2: Add explicit `auth: true` to contest join route [AGG-2]

**Severity:** LOW/LOW (2 of 11 perspectives)
**File:** `src/app/api/v1/contests/join/route.ts:9-11`
**Status:** Done

**Tasks:**
- [x] Add `auth: true` to the `createApiHandler` config for the contest join route
- [x] Verify TypeScript compiles without errors
- [x] Commit with message: `refactor(contests): ♻️ add explicit auth:true to join route`

**Commit:** 389feae0

---

### Lane 3: Run quality gates

**Severity:** Required
**Status:** Done

**Tasks:**
- [x] Run `eslint` — passed (exit 0)
- [x] Run `npm run build` — passed
- [x] Run `npm run test:unit` — passed (294 test files, 2116 tests)
- [x] Run `npm run test:component` — skipped (no DB connection)
- [x] No gate failures

---

## Deferred Items

| Finding | File+Line | Severity/Confidence | Reason for Deferral | Exit Criterion |
|---------|-----------|-------------------|--------------------|---------------|
| AGG-2: Contest join lacks explicit auth:true | contests/join/route.ts:9 | LOW/LOW | Included as Lane 2 since trivial | N/A (being fixed this cycle) |
| Prior AGG-2: Audit logs LIKE-based JSON search | audit-logs/page.tsx:150 | LOW/LOW | Works today; robustness improvement | JSON serialization changes or PostgreSQL upgrade |
| Prior PERF-3: Anti-cheat heartbeat gap query transfers up to 5000 rows | anti-cheat/route.ts:195-204 | MEDIUM/MEDIUM | Could use SQL window function; currently bounded by limit | Long contest with many heartbeats causes slow API response |
| Prior AGG-5: Console.error in client components | discussions/*.tsx, groups/*.tsx | LOW/MEDIUM | Requires architectural decision; no data loss | Client error reporting feature request |
| Prior AGG-6: SSE O(n) eviction scan | events/route.ts:44-55 | LOW/LOW | Bounded by 1000-entry cap | Performance profiling shows bottleneck |
| Prior AGG-7: Manual routes duplicate createApiHandler | migrate/import, restore routes | MEDIUM/MEDIUM | Requires extending createApiHandler to support multipart | Next API framework iteration |
| Prior AGG-8: Global timer HMR pattern duplication | 4 modules | LOW/MEDIUM | DRY concern; each module works correctly | Module refactoring cycle |
| Prior SEC-3: Anti-cheat copies text content | anti-cheat-monitor.tsx:206 | LOW/LOW | 80-char limit; privacy notice accepted | Privacy audit or user complaint |
| Prior SEC-4: Docker build error leaks paths | docker/client.ts:169 | LOW/LOW | Admin-only; Docker output expected | Admin permission review |
| Prior DOC-1: SSE route ADR | events/route.ts | LOW/LOW | Documentation-only | Next documentation cycle |
| Prior DOC-2: Docker client dual-path docs | docker/client.ts | LOW/LOW | Documentation-only | Next documentation cycle |
| Prior ARCH-2: Stale-while-revalidate cache pattern duplication | contest-scoring.ts, analytics/route.ts | LOW/LOW | DRY concern; both modules work correctly | Module refactoring cycle |
| Prior DES-1: Chat widget button badge lacks ARIA announcement | chat-widget.tsx:284-288 | LOW/LOW | Screen reader edge case; badge is visual-only | Accessibility audit or user complaint |
