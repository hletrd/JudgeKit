# RPF Cycle 45 — Review Remediation Plan

**Date:** 2026-04-23
**Cycle:** 45/100
**Base commit:** d96a984f
**Status:** Done

## Lanes

### Lane 1: Replace non-null assertions in client components [AGG-1]

**Severity:** MEDIUM/MEDIUM (7 of 11 perspectives)
**Status:** Done

**Tasks:**
- [x] In `student/[userId]/page.tsx:131`, replace `submissionsByProblem.get(sub.problemId)!.push(sub)` with explicit null guard
- [x] In `submission-detail-client.tsx:85`, replace `submission.problem!.id` with null guard and guard `handleResubmit`
- [x] In `contests/page.tsx:214`, replace `(contest.personalDeadline ?? contest.deadline)!.getTime()` with `new Date(...).getTime()`
- [x] In `problem-set-form.tsx:200`, replace `problemSet!.id` with `problemSet?.id ?? ""`
- [x] In `role-editor-dialog.tsx:76`, replace `role!.id` with `role?.id ?? ""`
- [x] Verify TypeScript compiles without errors
- [x] Run existing tests to confirm no regressions
- [x] Commit: `refactor(ui): ♻️ replace non-null assertions with null guards in client components` (dc6c5b0e)

---

### Lane 2: Fix broken unit test for getDbNowUncached mock

**Severity:** Required (gate fix)
**Status:** Done

**Tasks:**
- [x] Add `@/lib/db-time` mock to `tests/unit/assignments/submissions.test.ts`
- [x] Replace `vi.spyOn(Date, "now")` with `getDbNowUncachedMock.mockResolvedValue()`
- [x] Verify all 12 tests pass
- [x] Commit: `fix(tests): 🐛 mock getDbNowUncached in submissions unit tests` (fd39f76d)

---

### Lane 3: Run quality gates

**Severity:** Required
**Status:** Done

**Tasks:**
- [x] Run `eslint` — passed (exit 0)
- [x] Run `npm run build` — passed
- [x] Run `npm run test:unit` — passed (294 test files, 2116 tests)
- [x] Run `npm run test:component` — 19 pre-existing failures (not caused by this cycle's changes; same count as before changes)
- [x] Gate failures fixed (test mock)

---

## Deferred Items

| Finding | File+Line | Severity/Confidence | Reason for Deferral | Exit Criterion |
|---------|-----------|-------------------|--------------------|---------------|
| AGG-2: Rate-limiting Date.now() for DB timestamps | api-rate-limit.ts:54 | MEDIUM/MEDIUM | Adding DB query to hot path increases latency; rate-limit windows are minutes-level | Clock skew observed in production affecting rate limiting |
| AGG-3: Analytics progression unbounded query | contest-analytics.ts:242 | MEDIUM/LOW | Bounded by 5-min cache; typical contest sizes are manageable | Contest with >500 students causes slow analytics response |
| Prior AGG-2: Leaderboard freeze uses Date.now() | leaderboard.ts:52 | LOW/LOW | Display-only inaccuracy; seconds-level | Leaderboard freeze timing becomes a user-facing issue |
| Prior AGG-5: Console.error in client components | discussions/*.tsx, groups/*.tsx | LOW/MEDIUM | Requires architectural decision; no data loss | Client error reporting feature request |
| Prior AGG-6: SSE O(n) eviction scan | events/route.ts:44-55 | LOW/LOW | Bounded by 1000-entry cap | Performance profiling shows bottleneck |
| Prior AGG-7: Manual routes duplicate createApiHandler | migrate/import, restore routes | MEDIUM/MEDIUM | Requires extending createApiHandler to support multipart | Next API framework iteration |
| Prior AGG-8: Global timer HMR pattern duplication | 4 modules | LOW/MEDIUM | DRY concern; each module works correctly | Module refactoring cycle |
| Prior SEC-3: Anti-cheat copies text content | anti-cheat-monitor.tsx:206 | LOW/LOW | 80-char limit; privacy notice accepted | Privacy audit or user complaint |
| Prior SEC-4: Docker build error leaks paths | docker/client.ts:169 | LOW/LOW | Admin-only; Docker output expected | Admin permission review |
| Prior PERF-3: Anti-cheat heartbeat gap query transfers up to 5000 rows | anti-cheat/route.ts:195-204 | MEDIUM/MEDIUM | Could use SQL window function; currently bounded by limit | Long contest with many heartbeats causes slow API response |
| Prior DES-1: Chat widget button badge lacks ARIA announcement | chat-widget.tsx:284-288 | LOW/LOW | Screen reader edge case; badge is visual-only | Accessibility audit or user complaint |
| Prior DOC-1: SSE route ADR | events/route.ts | LOW/LOW | Documentation-only | Next documentation cycle |
| Prior DOC-2: Docker client dual-path docs | docker/client.ts | LOW/LOW | Documentation-only | Next documentation cycle |
| Prior ARCH-2: Stale-while-revalidate cache pattern duplication | contest-scoring.ts, analytics/route.ts | LOW/LOW | DRY concern; both modules work correctly | Module refactoring cycle |
| Prior SEC-2: Anti-cheat heartbeat dedup Date.now() | anti-cheat/route.ts:92 | LOW/LOW | Approximate by design; LRU cache is inherently imprecise | Performance profiling shows missed dedup |
