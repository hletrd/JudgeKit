# Aggregate Review — Cycle 25

**Date:** 2026-04-24
**Reviewers:** code-reviewer, security-reviewer, perf-reviewer, architect, critic, test-engineer, verifier, debugger
**Total findings:** 10 (deduplicated to 3)

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] Windowed-exam late-penalty scoring missing from `getAssignmentStatusRows` — data inconsistency with leaderboard

**Sources:** CR-1, S-1, A-1, C-1, V-1, D-1 | **Confidence:** HIGH
**Cross-agent signal:** 6 of 8 review perspectives

The inline CASE expression in `getAssignmentStatusRows` at `src/lib/assignments/submissions.ts:568-578` only applies IOI late penalties against the global deadline (`submitted_at > @deadline`). It does NOT apply penalties against the per-user `personal_deadline` for windowed exams. The canonical `buildIoiLatePenaltyCaseExpr()` in `src/lib/assignments/scoring.ts:54-76` correctly handles both branches (non-windowed and windowed).

This causes the assignment status page to show unpenalized scores for windowed-exam students who submitted after their personal deadline but before the global deadline, while the leaderboard and stats endpoints correctly show penalized scores.

**Concrete failure scenario:** A windowed exam has `latePenalty: 20` (20% deduction). Student A has `personalDeadline: 10:00 AM`, global `deadline: 12:00 PM`. Student A submits at 10:30 AM (30 min late relative to personal deadline). The leaderboard shows the penalized score (80% of base). The status page shows the unpenalized score (100% of base). The instructor and student see inconsistent data.

**Fix:**
1. Add `LEFT JOIN exam_sessions es ON es.assignment_id = s.assignment_id AND es.user_id = s.user_id` to the CTE in `getAssignmentStatusRows`.
2. Replace the inline CASE expression with a call to `buildIoiLatePenaltyCaseExpr("s.score", "COALESCE(ap.points, 100)", "s.submitted_at", "es.personal_deadline")`.
3. Pass `examMode` and `latePenalty` as named parameters to the raw query.
4. Add a test verifying scoring consistency between the status page and leaderboard for windowed exams with late penalties.

---

### AGG-2: [LOW] TypeScript-level `mapSubmissionPercentageToAssignmentPoints` also misses windowed-exam branch

**Sources:** A-1, C-2, TE-2 | **Confidence:** MEDIUM
**Cross-agent signal:** 3 of 8 review perspectives

`mapSubmissionPercentageToAssignmentPoints` at `src/lib/assignments/scoring.ts:13-28` compares `submittedAt > deadline` but does not check `personalDeadline`. While this function appears unused in production scoring paths (the SQL-level scoring is authoritative), it is exported and could be called by future code. It should either be updated to handle windowed exams or deprecated with a clear comment.

**Fix:** Add an optional `personalDeadline` parameter and apply the windowed-branch logic, or add a deprecation comment noting that `buildIoiLatePenaltyCaseExpr` is the canonical source of truth for scoring.

---

### AGG-3: [LOW] `rateLimitedResponse` uses `Date.now()` fallback when `nowMs` is undefined

**Sources:** CR-2, V-2 | **Confidence:** MEDIUM
**Cross-agent signal:** 2 of 8 review perspectives

`rateLimitedResponse` at `src/lib/security/api-rate-limit.ts:125` uses `(nowMs ?? Date.now())` for the `X-RateLimit-Reset` header. Both current callers always pass `nowMs` from `atomicConsumeRateLimit` (which uses `getDbNowMs()`), so the fallback is dead code in normal operation. However, the function signature allows `nowMs` to be `undefined`, creating a latent risk that a future caller could omit it and produce an inaccurate reset timestamp due to clock skew.

**Fix:** Make `nowMs` a required parameter in `rateLimitedResponse`, or add a development-only assertion.

---

## Carried Forward from Prior Cycles

All prior DEFER items (DEFER-1 through DEFER-14 from cycle 24 plan) remain unchanged.

## Positive Observations

- All clock-skew-sensitive paths (contest boundaries, anti-cheat, rate limiting, SSE coordination, data retention) consistently use `getDbNowMs()` / `getDbNowUncached()`
- `createApiHandler` correctly awaits `params` for Next.js 16 compatibility
- `escapeLikePattern` is used correctly with `ESCAPE '\\'` clauses throughout
- `resolveStoredPath` properly prevents path traversal in file operations
- `namedToPositional` validates parameter names and prevents SQL injection
- CSP is well-configured with nonce-based script-src and proper frame-ancestors
- Password hashing uses Argon2id with OWASP-recommended parameters
- Dummy password hash prevents user-enumeration via timing
- No `eval()`, `new Function()`, or `Math.random()` in security contexts
- No `as any` type casts in server code
- DOMPurify sanitization is well-configured with narrow tag/attribute allowlists
- All cycle 24 fixes verified as correctly implemented

## No Agent Failures

All 8 review perspectives completed successfully.
