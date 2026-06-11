# Cycle 8 — security-reviewer lens

**HEAD:** db1a28d0. Focus: ranking/leaderboard access control + SQL safety + the N8 fix surface.

## N8-C8-LIVERANK security assessment
The fix only changes aggregation shape (MAX-per-problem then SUM vs SUM-over-rows). Column names passed to `buildIoiLatePenaltyCaseExpr` remain hardcoded literals (`s.score`, `COALESCE(ap.points, 100)`, `s.submitted_at`, `es.personal_deadline`) — all pass `validateSqlColumnName` and none are user-influenced. Parameters (`assignmentId`, `userId`, `deadline`, `latePenalty`, `examMode`) stay bound, not interpolated. No injection surface added. The fix is security-neutral.

Note: the bug is mildly security-relevant in a recruiting/exam context — an inflated live rank could mislead a candidate about their standing, but the *authoritative* override-aware board is correct and access control (`leaderboard/route.ts:35-54`, recruiting-candidate 403, exam-mode anonymization) is unaffected. No PII leak: `userId` is cleared for non-instructors (route.ts:72-79). No score-tampering vector (live rank is read-only display).

## No NEW security findings
Leaderboard route authz (instructor/enrolled/access-token, recruiting 403, exam anonymization) verified intact. Override route requires manage permission. Carried deferred security items (AGG-7 encryption plaintext fallback; rate-limit module duplication) unchanged → re-defer.
