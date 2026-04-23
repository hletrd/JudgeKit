# RPF Cycle 47 — Aggregate Review

**Date:** 2026-04-23
**Base commit:** f8ba7334
**Review artifacts:** code-reviewer.md, perf-reviewer.md, security-reviewer.md, architect.md, critic.md, verifier.md, debugger.md, test-engineer.md, tracer.md, designer.md, document-specialist.md

## Deduped Findings (sorted by severity then signal)

### AGG-1: `checkServerActionRateLimit` uses `Date.now()` inside DB transaction — clock-skew in server action rate limiting [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-1), security-reviewer (SEC-1), architect (ARCH-1), critic (CRI-1), verifier (V-1), debugger (DBG-1), test-engineer (TE-1), tracer (TR-1), document-specialist (DOC-1)
**Signal strength:** 9 of 11 review perspectives

**File:** `src/lib/security/api-rate-limit.ts:215`

**Description:** `checkServerActionRateLimit` captures `const now = Date.now()` and uses it inside `execTransaction` to compare against DB-stored `windowStartedAt` and to write timestamps. This is the same clock-skew class fixed in `realtime-coordination.ts` (cycle 46), `validateAssignmentSubmission` (cycle 45), and the assignment PATCH route (cycle 40). Unlike `atomicConsumeRateLimit` (deferred due to hot-path concerns on every API request), server actions are called infrequently (role edits, group management) and can tolerate the <1ms DB round-trip cost of `getDbNowUncached()`.

**Concrete failure scenario (premature window reset):** App clock 5 seconds ahead of DB. A user's rate-limit window was set at DB time 10:00:00 with a 60s window. At DB time 10:00:55, the app thinks it's 10:01:00. The check `windowStartedAt + 60000 <= now` evaluates true, resetting the counter 5 seconds early. The user gets a fresh window and can perform more actions than configured.

**Fix:** Use `getDbNowUncached()` at the start of the transaction:
```typescript
const now = (await getDbNowUncached()).getTime();
```

---

### AGG-2: Zip import uses `fileMap.get(key)!` non-null assertion — last remaining `Map.get()!` [LOW/LOW]

**Flagged by:** code-reviewer (CR-2), test-engineer (TE-2)
**Signal strength:** 2 of 11 review perspectives

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:196`

**Description:** `const pair = fileMap.get(key)!;` — the key comes from iterating `fileMap.keys()`, so the assertion is technically safe. However, this is the only remaining `Map.get()!` in the codebase after cycles 43-46 systematically replaced them with null-safe alternatives.

**Fix:** Use null guard: `const pair = fileMap.get(key); if (!pair) continue;`

---

### AGG-3: Practice page `resolvedSearchParams?.sort as SortOption` — unsafe type assertion [LOW/LOW]

**Flagged by:** code-reviewer (CR-3)
**Signal strength:** 1 of 11 review perspectives

**File:** `src/app/(public)/practice/page.tsx:128-129`

**Description:** The code casts `resolvedSearchParams?.sort` (which is `string | undefined`) as `SortOption` before the `includes` check validates it. The `includes` check does validate the runtime value, so this is safe in practice, but the type assertion is misleading.

**Fix:** Cosmetic — use a more type-safe approach.

---

### AGG-4: `checkServerActionRateLimit` uses `Date.now()` without clock-skew comment [LOW/LOW]

**Flagged by:** document-specialist (DOC-1)
**Signal strength:** 1 of 11 review perspectives

**File:** `src/lib/security/api-rate-limit.ts:215`

**Description:** The function uses `Date.now()` without a comment explaining the inconsistency with the codebase convention. If the clock-skew issue is fixed (AGG-1), this finding is moot. If deferred, a `// TODO(clock-skew)` comment should be added.

**Fix:** Superseded by AGG-1 fix. If AGG-1 is deferred, add a TODO comment.

---

## Carry-Over Items (Still Unfixed from Prior Cycles)

- **Prior AGG-2:** Leaderboard freeze uses Date.now() (deferred, LOW/LOW)
- **Prior AGG-5:** Console.error in client components (deferred, LOW/MEDIUM)
- **Prior AGG-6:** SSE O(n) eviction scan (deferred, LOW/LOW)
- **Prior AGG-7:** Manual routes duplicate createApiHandler boilerplate (deferred, MEDIUM/MEDIUM)
- **Prior AGG-8:** Global timer HMR pattern duplication (deferred, LOW/MEDIUM)
- **Prior SEC-3:** Anti-cheat copies user text content (deferred, LOW/LOW)
- **Prior SEC-4:** Docker build error leaks paths (deferred, LOW/LOW)
- **Prior PERF-3:** Anti-cheat heartbeat gap query transfers up to 5000 rows (deferred, MEDIUM/MEDIUM)
- **Prior DES-1:** Chat widget button badge lacks ARIA announcement (deferred, LOW/LOW)
- **Prior DES-1 (cycle 46):** Contests page badge hardcoded colors (deferred, LOW/LOW)
- **Prior DOC-1:** SSE route ADR (deferred, LOW/LOW)
- **Prior DOC-2:** Docker client dual-path docs (deferred, LOW/LOW)
- **Prior ARCH-2:** Stale-while-revalidate cache pattern duplication (deferred, LOW/LOW)
- **Prior SEC-2 (from cycle 43):** Anti-cheat heartbeat dedup uses Date.now() for LRU cache (deferred, LOW/LOW)
- **Prior AGG-2 (from cycle 45):** `atomicConsumeRateLimit` uses Date.now() in hot path (deferred, MEDIUM/MEDIUM)

## Verified Fixes This Cycle (From Prior Cycles)

All fixes from cycles 37-46 remain intact:
1. `"redeemed"` removed from PATCH route state machine
2. `Date.now()` replaced with `getDbNowUnc()` in assignment PATCH
3. Non-null assertions removed from anti-cheat heartbeat gap detection
4. NaN guard in quick-create route
5. MAX_EXPIRY_MS guard in bulk route
6. Un-revoke transition removed from PATCH route
7. Exam session short-circuit for non-exam assignments
8. ESCAPE clause in SSE LIKE queries
9. Chat widget ARIA label with message count
10. Case-insensitive email dedup in bulk route
11. computeExpiryFromDays extracted to shared helper
12. problemPoints/refine validation in quick-create
13. Capability-based auth on access-code routes
14. Redundant non-null assertion removed from userId
15. Submission rate-limit uses `getDbNowUncached()` for clock-skew consistency
16. Contest join route has explicit `auth: true`
17. `validateAssignmentSubmission` uses `getDbNowUncached()` for deadline enforcement
18. Map.get() non-null assertions replaced in contest-scoring, submissions, contest-analytics
19. Non-null assertions replaced with null guards in client components (submission-detail, problem-set-form, role-editor)
20. `realtime-coordination.ts` uses `getDbNowUncached()` for SSE slot and heartbeat
21. Contests page uses null guards for `statusMap.get()`
22. IOI leaderboard has deterministic tie-breaking via userId
23. Candidate dashboard uses null guards for `assignmentProblemProgressMap.get()`

## Deferred Items

| Finding | File+Line | Severity/Confidence | Reason for Deferral | Exit Criterion |
|---------|-----------|-------------------|--------------------|---------------|
| AGG-3: Practice page unsafe type assertion | practice/page.tsx:128-129 | LOW/LOW | Type-safe by runtime validation; cosmetic | Module refactoring cycle |
| AGG-4: Missing clock-skew comment | api-rate-limit.ts:215 | LOW/LOW | Superseded by AGG-1 fix | AGG-1 resolved or deferred |
| Prior AGG-2: Rate-limiting Date.now() for DB timestamps | api-rate-limit.ts:54 | MEDIUM/MEDIUM | Adding DB query to hot path increases latency; rate-limit windows are minutes-level | Clock skew observed in production affecting rate limiting |
| Prior AGG-3: Analytics progression unbounded query | contest-analytics.ts:242 | MEDIUM/LOW | Bounded by 5-min cache; typical contest sizes are manageable | Contest with >500 students causes slow analytics response |
| Prior AGG-2: Leaderboard freeze uses Date.now() | leaderboard.ts:52 | LOW/LOW | Display-only inaccuracy; seconds-level | Leaderboard freeze timing becomes a user-facing issue |
| Prior AGG-5: Console.error in client components | discussions/*.tsx, groups/*.tsx | LOW/MEDIUM | Requires architectural decision; no data loss | Client error reporting feature request |
| Prior AGG-6: SSE O(n) eviction scan | events/route.ts:44-55 | LOW/LOW | Bounded by 1000-entry cap | Performance profiling shows bottleneck |
| Prior AGG-7: Manual routes duplicate createApiHandler | migrate/import, restore routes | MEDIUM/MEDIUM | Requires extending createApiHandler to support multipart | Next API framework iteration |
| Prior AGG-8: Global timer HMR pattern duplication | 4 modules | LOW/MEDIUM | DRY concern; each module works correctly | Module refactoring cycle |
| Prior SEC-3: Anti-cheat copies text content | anti-cheat-monitor.tsx:206 | LOW/LOW | 80-char limit; privacy notice accepted | Privacy audit or user complaint |
| Prior SEC-4: Docker build error leaks paths | docker/client.ts:169 | LOW/LOW | Admin-only; Docker output expected | Admin permission review |
| Prior PERF-3: Anti-cheat heartbeat gap query transfers up to 5000 rows | anti-cheat/route.ts:195-204 | MEDIUM/MEDIUM | Could use SQL window function; currently bounded by limit | Long contest with many heartbeats causes slow API response |
| Prior DES-1: Chat widget button badge lacks ARIA announcement | chat-widget.tsx:284-288 | LOW/LOW | Screen reader edge case; badge is visual-only | Accessibility audit or user complaint |
| Prior DES-1 (cycle 46): Contests page badge hardcoded colors | contests/page.tsx:224 | LOW/LOW | Visual-only; current colors have adequate contrast | Dark mode audit |
| Prior DOC-1: SSE route ADR | events/route.ts | LOW/LOW | Documentation-only | Next documentation cycle |
| Prior DOC-2: Docker client dual-path docs | docker/client.ts | LOW/LOW | Documentation-only | Next documentation cycle |
| Prior ARCH-2: Stale-while-revalidate cache pattern duplication | contest-scoring.ts, analytics/route.ts | LOW/LOW | DRY concern; both modules work correctly | Module refactoring cycle |
| Prior SEC-2: Anti-cheat heartbeat dedup Date.now() | anti-cheat/route.ts:92 | LOW/LOW | Approximate by design; LRU cache is inherently imprecise | Performance profiling shows missed dedup |
