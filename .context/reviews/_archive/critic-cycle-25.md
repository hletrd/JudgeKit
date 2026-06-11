# Critic — Cycle 25

**Date:** 2026-04-24
**Scope:** Multi-perspective critique

---

## C-1: [MEDIUM] Windowed-exam late-penalty inconsistency between status page and leaderboard

**Confidence:** HIGH
**Cross-agent signal:** CR-1, S-1, A-1 all flag the same root cause

The assignment status page (`getAssignmentStatusRows`) applies late penalties using only the global deadline, while the leaderboard and stats endpoints use `buildIoiLatePenaltyCaseExpr` which correctly handles both non-windowed and windowed modes. For windowed exams with a late penalty, this creates a user-facing inconsistency: a student who submitted late relative to their personal deadline sees an unpenalized score on the status page but a penalized score on the leaderboard.

This is the most impactful finding this cycle because it affects contest integrity — the status page is the primary view instructors use to monitor student progress.

**Fix:** Replace inline CASE with `buildIoiLatePenaltyCaseExpr()`, add LEFT JOIN to exam_sessions in the CTE.

---

## C-2: [LOW] TypeScript-level `mapSubmissionPercentageToAssignmentPoints` also misses windowed branch

**Confidence:** MEDIUM
**Citations:** `src/lib/assignments/scoring.ts:13-28`

The TypeScript function `mapSubmissionPercentageToAssignmentPoints` compares `submittedAt > deadline` but does not check `personalDeadline`. If this function is ever used for windowed-exam scoring (currently it appears unused in production code paths — the SQL-level scoring is authoritative), it would produce incorrect results.

**Fix:** Add an optional `personalDeadline` parameter and apply the windowed-branch logic, or add a deprecation comment noting that SQL-level scoring via `buildIoiLatePenaltyCaseExpr` is the canonical source.

---

## Positive Observations

- The codebase shows strong consistency in security practices (DB time, parameterized queries, CSP, CSRF)
- Cycle 24 fixes (security headers, DB time in retention, ZIP metadata, Argon2 needsRehash) are all correctly implemented
- Test coverage is extensive with source-grep tests validating remediation fixes
