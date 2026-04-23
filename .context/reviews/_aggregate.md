# RPF Cycle 44 — Aggregate Review

**Date:** 2026-04-23
**Base commit:** e2043115
**Review artifacts:** code-reviewer.md, perf-reviewer.md, security-reviewer.md, architect.md, critic.md, verifier.md, debugger.md, test-engineer.md, tracer.md, designer.md, document-specialist.md

## Deduped Findings (sorted by severity then signal)

### AGG-1: `validateAssignmentSubmission` uses `Date.now()` for deadline enforcement — clock-skew bypass [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-1), security-reviewer (SEC-1), architect (ARCH-1), critic (CRI-1), verifier (V-1), debugger (DBG-1), test-engineer (TE-1), tracer (TR-1), document-specialist (DOC-1)
**Signal strength:** 9 of 11 review perspectives

**File:** `src/lib/assignments/submissions.ts:208,220,268`

**Description:** The `validateAssignmentSubmission` function computes `now = Date.now()` using the app server's clock at line 208, then compares it against DB-stored assignment timestamps (`startsAt`, `deadline`, `lateDeadline`) at lines 212 and 220, and against `examSession.personalDeadline` at line 268. The codebase has consistently converged on using `getDbNowUncached()` for all schedule comparisons involving DB data to avoid clock skew. This is the last remaining server-side access-control function that uses `Date.now()` for comparisons against DB-stored timestamps.

**Concrete failure scenario:** App server clock is 60 seconds behind DB server clock. A contest deadline is 10:00:00 (DB time). At 10:00:30 DB time, the app server thinks it's 9:59:30 and allows a submission that is past the deadline. Users gain 60 extra seconds to submit solutions. Conversely, if the app server clock is ahead, users are blocked before the actual deadline.

**Fix:** Replace `Date.now()` with `getDbNowUncached()` for the deadline comparisons:
```typescript
// Use DB server time for deadline checks to avoid clock skew
// between app and DB servers, consistent with other schedule checks.
const now = (await getDbNowUncached()).getTime();
```
Also replace the inline `Date.now()` at line 268 with the same `now` variable.

---

### AGG-2: `computeLeaderboard` uses `Date.now()` for freeze check — display-only clock skew [LOW/LOW]

**Flagged by:** code-reviewer (CR-3), security-reviewer (SEC-2)
**Signal strength:** 2 of 11 review perspectives

**File:** `src/lib/assignments/leaderboard.ts:52-53`

**Description:** The `computeLeaderboard` function computes `nowMs = Date.now()` and compares it against the DB-stored `freezeLeaderboardAt` timestamp to decide whether the leaderboard is frozen. Under clock skew, the freeze boundary is slightly inaccurate (seconds). This is a display-only concern — the frozen leaderboard data itself is correct.

**Fix:** Use `getDbNowUncached()` for consistency if the function is refactored. Low priority.

---

### AGG-3: Non-null assertions on `Map.get()` after `has()` guard — three locations [LOW/LOW]

**Flagged by:** code-reviewer (CR-2), test-engineer (TE-2)
**Signal strength:** 2 of 11 review perspectives

**Files:**
- `src/lib/assignments/contest-scoring.ts:243`
- `src/lib/assignments/submissions.ts:365`
- `src/lib/assignments/contest-analytics.ts:259`

**Description:** These locations use the `!.get()` pattern after a `has()` guard. While technically safe due to the guard, this pattern was removed from other files in recent cycles (e.g., the anti-cheat route in cycle 41). The codebase is converging on explicit null-guard patterns.

**Fix:** Replace with explicit null-guard pattern for consistency.

---

## Carry-Over Items (Still Unfixed from Prior Cycles)

- **Prior AGG-2:** Audit logs LIKE-based JSON search (deferred, LOW/LOW)
- **Prior AGG-5:** Console.error in client components (deferred, LOW/MEDIUM)
- **Prior AGG-6:** SSE O(n) eviction scan (deferred, LOW/LOW)
- **Prior AGG-7:** Manual routes duplicate createApiHandler boilerplate (deferred, MEDIUM/MEDIUM)
- **Prior AGG-8:** Global timer HMR pattern duplication (deferred, LOW/MEDIUM)
- **Prior SEC-3:** Anti-cheat copies user text content (deferred, LOW/LOW)
- **Prior SEC-4:** Docker build error leaks paths (deferred, LOW/LOW)
- **Prior PERF-3:** Anti-cheat heartbeat gap query transfers up to 5000 rows (deferred, MEDIUM/MEDIUM)
- **Prior DES-1:** Chat widget button badge lacks ARIA announcement (deferred, LOW/LOW)
- **Prior DOC-1:** SSE route ADR (deferred, LOW/LOW)
- **Prior DOC-2:** Docker client dual-path docs (deferred, LOW/LOW)
- **Prior ARCH-2:** Stale-while-revalidate cache pattern duplication (deferred, LOW/LOW)
- **Prior SEC-2 (from cycle 43):** Anti-cheat heartbeat dedup uses Date.now() for LRU cache (deferred, LOW/LOW)

## Verified Fixes This Cycle (From Prior Cycles)

All fixes from cycles 37-43 remain intact:
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

## Deferred Items

| Finding | File+Line | Severity/Confidence | Reason for Deferral | Exit Criterion |
|---------|-----------|-------------------|--------------------|---------------|
| AGG-2: Leaderboard freeze uses Date.now() | leaderboard.ts:52 | LOW/LOW | Display-only inaccuracy; seconds-level | Leaderboard freeze timing becomes a user-facing issue |
| AGG-3: Non-null assertions on Map.get() | contest-scoring.ts:243, submissions.ts:365, contest-analytics.ts:259 | LOW/LOW | Technically safe; cosmetic consistency | Codebase lint rules enforce no non-null assertions |
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
