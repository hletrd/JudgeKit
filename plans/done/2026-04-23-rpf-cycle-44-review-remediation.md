# RPF Cycle 44 — Review Remediation Plan

**Date:** 2026-04-23
**Cycle:** 44/100
**Base commit:** e2043115
**Status:** Done

## Lanes

### Lane 1: Replace `Date.now()` with `getDbNowUncached()` in `validateAssignmentSubmission` [AGG-1]

**Severity:** MEDIUM/MEDIUM (9 of 11 perspectives)
**File:** `src/lib/assignments/submissions.ts:208,220,268`
**Status:** Done

**Tasks:**
- [x] Replace `const now = Date.now();` at line 208 with `const now = (await getDbNowUncached()).getTime();`
- [x] Replace inline `Date.now()` at line 268 with the same `now` variable
- [x] Add a comment explaining the use of DB time for deadline consistency
- [x] Ensure the function remains async (it already is)
- [x] Import `getDbNowUncached` from `@/lib/db-time` if not already imported
- [x] Verify TypeScript compiles without errors
- [x] Run existing tests to confirm no regressions
- [x] Commit with message: `fix(submissions): 🐛 use DB time for deadline enforcement to avoid clock skew`

**Commit:** a2a5b20c

---

### Lane 2: Replace non-null assertions on `Map.get()` with explicit null guards [AGG-3]

**Severity:** LOW/LOW (2 of 11 perspectives)
**Files:**
- `src/lib/assignments/contest-scoring.ts:243`
- `src/lib/assignments/submissions.ts:365`
- `src/lib/assignments/contest-analytics.ts:259`
**Status:** Done

**Tasks:**
- [x] In `contest-scoring.ts:243`, replace `userMap.get(row.userId)!.problems.set(...)` with explicit null guard
- [x] In `submissions.ts:365`, replace `submissionsByProblem.get(sub.problemId)!.add(...)` with explicit null guard
- [x] In `contest-analytics.ts:259`, replace `userProgressMap.get(sub.userId)!` with explicit null guard
- [x] Verify TypeScript compiles without errors
- [x] Run existing tests to confirm no regressions
- [x] Commit with message: `refactor(assignments): ♻️ replace Map.get() non-null assertions with explicit null guards`

**Commit:** ec00e252

---

### Lane 3: Run quality gates

**Severity:** Required
**Status:** Done

**Tasks:**
- [x] Run `eslint` — passed (exit 0)
- [x] Run `npm run build` — passed
- [x] Run `npm run test:unit` — passed
- [x] Run `npm run test:component` — passed
- [x] No gate failures

---

## Deferred Items

| Finding | File+Line | Severity/Confidence | Reason for Deferral | Exit Criterion |
|---------|-----------|-------------------|--------------------|---------------|
| AGG-2: Leaderboard freeze uses Date.now() | leaderboard.ts:52 | LOW/LOW | Display-only inaccuracy; seconds-level | Leaderboard freeze timing becomes a user-facing issue |
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
| Prior SEC-2: Anti-cheat heartbeat dedup Date.now() | anti-cheat/route.ts:92 | LOW/LOW | Approximate by design; LRU cache is inherently imprecise | Performance profiling shows missed dedup |
