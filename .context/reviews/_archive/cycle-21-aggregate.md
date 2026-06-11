# Cycle 21 Aggregate Review

**Date:** 2026-04-19
**Base commit:** 5a2ce6b4
**Reviewers:** code-reviewer, architect, critic, security-reviewer, perf-reviewer, debugger, test-engineer, verifier, designer

---

## Deduped Findings (sorted by severity then cross-agent count)

### AGG-1: Scoring SQL duplication between `contest-scoring.ts` and `leaderboard.ts` [MEDIUM/HIGH]

**Flagged by:** architect (F2), critic (F1)
**Files:** `src/lib/assignments/contest-scoring.ts:139-197`, `src/lib/assignments/leaderboard.ts:149-188`
**Description:** The IOI scoring SQL with late penalty handling is duplicated. Cycle 20 fix proved this duplication causes real bugs. No mechanical enforcement keeps them in sync.
**Fix:** Extract the IOI scoring CASE expression into a shared SQL fragment builder function.

### AGG-2: `participant-audit.ts` computes full leaderboard for single-user lookup [MEDIUM/HIGH]

**Flagged by:** code-reviewer (F1), perf-reviewer (F1), critic (F2)
**Files:** `src/lib/assignments/participant-audit.ts:13`
**Description:** `getParticipantAuditData` calls `computeContestRanking` to get one user's entry. Cold-cache O(n) for O(1) need. Cache mitigates repeated calls but not first call per window.
**Fix:** Create a single-user ranking query variant, or document the performance characteristic.

### AGG-3: No automated tests for `computeSingleUserLiveRank` [MEDIUM/HIGH]

**Flagged by:** test-engineer (F1), critic (F4)
**Files:** `src/lib/assignments/leaderboard.ts:85-199`
**Description:** Function added in cycle 19 and fixed in cycle 20 with zero tests. Multiple branches (ICPC/IOI, windowed/non-windowed late penalty) are untested.
**Fix:** Add integration tests for all branches.

### AGG-4: No automated tests for `getParticipantTimeline` [MEDIUM/MEDIUM]

**Flagged by:** test-engineer (F2)
**Files:** `src/lib/assignments/participant-timeline.ts:88-303`
**Description:** Complex logic for wrongBeforeAc, bestScore, firstAcAt, timeToFirstAc with ICPC/IOI branches is untested.
**Fix:** Add unit tests for wrongBeforeAc, isFirstAc, and sortTimeline.

### AGG-5: Leaderboard API `userId` clearing is fragile — potential PII leak vector [MEDIUM/HIGH]

**Flagged by:** architect (F1)
**Files:** `src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts:70-82`
**Description:** `userId: ""` pattern for non-instructors is easy to accidentally revert in a refactor, leaking all student IDs. Current code is safe but fragile.
**Fix:** Add a comment explaining why userId is always cleared, or use `undefined`/omit the field entirely.

### AGG-6: Anti-cheat `limit`/`offset` NaN causes 500 error [LOW/HIGH]

**Flagged by:** code-reviewer (F3), debugger (F1), test-engineer (F3)
**Files:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:148-149`
**Description:** `Number("abc")` -> NaN, `Math.max(1, NaN)` -> NaN, `.limit(NaN)` -> PostgreSQL error -> 500.
**Fix:** Use `parseInt` with fallback: `parseInt(searchParams.get("limit") ?? "100", 10) || 100`.

### AGG-7: `contest-analytics.ts` `adjustedScore` naming is misleading [LOW/HIGH]

**Flagged by:** code-reviewer (F2), critic (F3)
**Files:** `src/lib/assignments/contest-analytics.ts:242`
**Description:** Variable `adjustedScore` does NOT include late penalties unlike the leaderboard's "adjusted score". Naming inconsistency is a maintenance trap.
**Fix:** Rename to `rawScaledScore` and update comments.

### AGG-8: IOI live rank floating-point tie-breaking discrepancy with main leaderboard [LOW/HIGH]

**Flagged by:** verifier (F1)
**Files:** `src/lib/assignments/leaderboard.ts:186-187`
**Description:** SQL `us.total_score > t.total_score` uses strict inequality. Main leaderboard uses `isScoreTied` with epsilon 0.01. Float drift can cause rank discrepancy.
**Fix:** Use `ROUND(us.total_score, 2) > ROUND(t.total_score, 2)` in the SQL query.

### AGG-9: ICPC live rank missing third tiebreaker (last AC time) [LOW/MEDIUM]

**Flagged by:** debugger (F3)
**Files:** `src/lib/assignments/leaderboard.ts:106-146`
**Description:** Live rank query only breaks ties by (solved_count, total_penalty). Main leaderboard adds "earlier last AC time" as third tiebreaker.
**Fix:** Add last AC time tiebreaker to match main leaderboard sort order. Low priority — scenario is rare.

### AGG-10: `contest-analytics.ts` makes 5+ sequential DB queries — could parallelize [LOW/MEDIUM]

**Flagged by:** perf-reviewer (F3)
**Files:** `src/lib/assignments/contest-analytics.ts:92-292`
**Description:** Independent queries (problems, firstAcMap, contestMeta, cheatRows) could run in parallel with Promise.all.
**Fix:** Wrap independent queries in Promise.all after computeContestRanking.

### AGG-11: Anti-cheat heartbeat gap detection loads 5000 rows per GET request [LOW/MEDIUM]

**Flagged by:** perf-reviewer (F2)
**Files:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:189-198`
**Description:** Gap detection runs on every GET even when instructor is just browsing events. Could be lazy or cached.
**Fix:** Add `?includeGaps=true` query parameter, or cache gap results with short TTL.

### AGG-12: Anti-cheat IP/UA PII access without audit trail [LOW/HIGH]

**Flagged by:** security-reviewer (F1)
**Files:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:157-174`
**Description:** Any instructor can view student IP addresses and user agents with no audit log of access. GDPR consideration.
**Fix:** Add audit log entry when anti-cheat PII data is accessed, or document data classification.

### AGG-13: `sanitizeSubmissionForViewer` has hidden DB query — N+1 risk [LOW/MEDIUM]

**Flagged by:** security-reviewer (F2)
**Files:** `src/lib/submissions/visibility.ts:74`
**Description:** Function queries assignments table per invocation. Currently safe (single-submission callers only), but hidden DB query is a trap for future developers.
**Fix:** Accept assignment visibility settings as parameters, or document the DB query in JSDoc.

### AGG-14: `contest-scoring.ts` single-instance LRU cache not shared across workers [LOW/MEDIUM]

**Flagged by:** code-reviewer (F4)
**Files:** `src/lib/assignments/contest-scoring.ts:56`
**Description:** Each Next.js worker has its own cache instance. Stale data may differ between workers. Already mitigated by short TTL (30s).
**Fix:** Known limitation. For full consistency, use Redis — large architectural change. Document the limitation.

### AGG-15: SSE route not migrated to `createApiHandler` [LOW/MEDIUM]

**Flagged by:** architect (F3)
**Files:** `src/app/api/v1/submissions/[id]/events/route.ts`
**Description:** Only API route not using createApiHandler. Manually implements auth/error handling.
**Fix:** Extend createApiHandler to support streaming, or document as explicit exception.

### AGG-16: IOI cell dark mode contrast insufficient for low scores [LOW/MEDIUM]

**Flagged by:** designer (F3)
**Files:** `src/components/contest/leaderboard-table.tsx:189-201`
**Description:** Dark mode text lightness 65% for red (low score) cells gives ~4.1:1 contrast, borderline for WCAG AA.
**Fix:** Increase text lightness to 70% for dark mode IOI cells.

### AGG-17: Leaderboard z-index layering convention undocumented [LOW/MEDIUM]

**Flagged by:** designer (F1)
**Files:** `src/components/contest/leaderboard-table.tsx:327,330,371,390`
**Description:** z-5 for sticky columns, z-10 for sticky header, z-50+ for overlays — not documented.
**Fix:** Add a comment documenting the z-index layering convention.

### AGG-18: contest-scoring.ts missing edge case tests [LOW/MEDIUM]

**Flagged by:** test-engineer (F4)
**Files:** `src/lib/assignments/contest-scoring.ts`
**Description:** Untested edge cases: all-zero scores, ICPC with null startsAt, single participant, IOI floating-point tie-breaking.
**Fix:** Add edge case tests.

### AGG-19: Live rank badge could benefit from `aria-live="polite"` [LOW/MEDIUM]

**Flagged by:** designer (F2)
**Files:** `src/components/contest/leaderboard-table.tsx`
**Description:** Screen readers won't announce live rank updates automatically.
**Fix:** Add `aria-live="polite"` to live rank badge.

---

## Verified Safe / No Bug Found

- `computeSingleUserLiveRank` windowed late penalty — correctly implemented (verifier F3)
- `LeaderboardTable` live rank badge — correctly uses both isCurrentUser and currentUserId (verifier F3)
- `exam-sessions.ts` startExamSession idempotency — onConflictDoNothing + re-fetch is correct (verifier F2)
- ICPC wrongBeforeAc window function — correctly excludes post-AC submissions (debugger F2, reclassified)
- `encryption.ts` decrypt plaintext fallback — necessary for backward compatibility (security-reviewer F3)

---

## Cross-Agent Agreement Summary

| Finding | Flagged By | Severity |
|---------|------------|----------|
| Scoring SQL duplication (AGG-1) | architect, critic | MEDIUM |
| Full-leaderboard-for-one-user (AGG-2) | code-reviewer, perf-reviewer, critic | MEDIUM |
| Missing live rank tests (AGG-3) | test-engineer, critic | MEDIUM |
| Anti-cheat NaN limit/offset (AGG-6) | code-reviewer, debugger, test-engineer | LOW |
| adjustedScore naming (AGG-7) | code-reviewer, critic | LOW |

---

## Agent Failures

None — all 9 review agents returned successfully.
