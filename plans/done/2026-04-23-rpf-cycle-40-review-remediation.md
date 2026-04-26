# RPF Cycle 40 — Review Remediation Plan

**Date:** 2026-04-23
**Cycle:** 40/100
**Base commit:** f030233a
**Status:** Done

## Lanes

### Lane 1: Replace `Date.now()` with `getDbNowUncached()` in assignment PATCH active-contest check [AGG-1]

**Severity:** MEDIUM/MEDIUM (9 of 11 perspectives)
**File:** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/route.ts:99-101`
**Status:** Done

**Tasks:**
- [x] Replace `const now = Date.now();` with `const now = await getDbNowUncached();`
- [x] Update the comparison to use `now.getTime()` instead of raw `now` value
- [x] Add a comment explaining why DB server time is used (consistent with recruiting invitation routes)
- [x] Verify `getDbNowUncached` import is present (add if not)
- [x] Verify the fix works: problem changes are blocked when contest has started (DB time >= startsAt)

**Commit:** ff532a69

---

### Lane 2: Remove non-null assertions on nullable `createdAt` in anti-cheat heartbeat gap detection [AGG-2]

**Severity:** LOW/LOW (3 of 11 perspectives)
**File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:211-213`
**Status:** Done

**Tasks:**
- [x] Replace `heartbeats[i - 1].createdAt!` with `heartbeats[i - 1].createdAt` (after the existing null guard on line 211)
- [x] Replace `heartbeats[i].createdAt!` with `heartbeats[i].createdAt` (after the existing null guard)
- [x] Verify TypeScript still compiles without errors (the null guard ensures type safety)

**Commit:** 3acee3c9

---

### Lane 3: Run quality gates

**Severity:** Required
**Status:** Done

**Tasks:**
- [x] Run `eslint` — passed (exit 0)
- [x] Run `npm run build` — passed
- [x] Run `npm run test:unit` — passed (294 test files, 2116 tests)
- [x] Run `npm run test:integration` — skipped (no DB connection)
- [x] Run `npm run test:component` — 10 pre-existing failures in unrelated tests (PostgreSQL pool not available); all tests related to changed files pass

---

## Deferred Items

| Finding | File+Line | Severity/Confidence | Reason for Deferral | Exit Criterion |
|---------|-----------|-------------------|--------------------|---------------|
| PERF-1: Shared poll timer reads config on restart | events/route.ts:161 | LOW/LOW | Timer only restarts on first subscriber after quiet period; infrequent | Performance profiling shows bottleneck |
| PERF-2: SSE connection eviction linear search | events/route.ts:44-55 | LOW/LOW | Bounded by 1000-entry cap; O(n) is acceptable | Cap is raised significantly |
| PERF-3: Anti-cheat heartbeat gap query transfers up to 5000 rows | anti-cheat/route.ts:195-204 | MEDIUM/MEDIUM | Could use SQL window function; currently bounded by limit | Long contest with many heartbeats causes slow API response |
| DES-1: Chat widget button badge lacks ARIA announcement | chat-widget.tsx:284-288 | LOW/LOW | Screen reader edge case; badge is visual-only | Accessibility audit or user complaint |
| Prior AGG-5: Console.error in client components | discussions/*.tsx, groups/*.tsx | LOW/MEDIUM | Requires architectural decision; no data loss | Client error reporting feature request |
| Prior AGG-6: SSE O(n) eviction scan | events/route.ts:44-55 | LOW/LOW | Bounded by 1000-entry cap | Performance profiling shows bottleneck |
| Prior AGG-7: Manual routes duplicate createApiHandler | migrate/import, restore routes | MEDIUM/MEDIUM | Requires extending createApiHandler to support multipart | Next API framework iteration |
| Prior AGG-8: Global timer HMR pattern duplication | 4 modules | LOW/MEDIUM | DRY concern; each module works correctly | Module refactoring cycle |
| Prior SEC-3: Anti-cheat copies text content | anti-cheat-monitor.tsx:206 | LOW/LOW | 80-char limit; privacy notice accepted | Privacy audit or user complaint |
| Prior SEC-4: Docker build error leaks paths | docker/client.ts:169 | LOW/LOW | Admin-only; Docker output expected | Admin permission review |
| Prior DOC-1: SSE route ADR | events/route.ts | LOW/LOW | Documentation-only | Next documentation cycle |
| Prior DOC-2: Docker client dual-path docs | docker/client.ts | LOW/LOW | Documentation-only | Next documentation cycle |
