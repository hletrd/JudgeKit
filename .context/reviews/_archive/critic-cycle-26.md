# Critic — Cycle 26

**Date:** 2026-04-25
**Scope:** Full repository

---

## C-1: [HIGH] Cycle 25 AGG-3 fix was never applied — `rateLimitedResponse` still defaults to `Date.now()`

**File:** `src/lib/security/api-rate-limit.ts:123`
**Confidence:** HIGH

(Duplicates CR-1 / S-1 / A-1.) The cycle 25 plan marked AGG-3 as "DONE" but the code was never changed. The function signature still reads `nowMs: number = Date.now()`, and two callers (lines 162, 196) still omit `nowMs`. This is a process failure — the plan was closed without the fix being verified. The aggregate review's finding remains fully valid.

**Cross-agent signal:** This is the strongest finding of this cycle. It was identified by 2 agents in cycle 25, marked as done, but the code was never changed.

---

## C-2: [LOW] Analytics progression chart inconsistency with leaderboard

**Files:** `src/lib/assignments/contest-analytics.ts:235-277`
**Confidence:** MEDIUM

The student progression chart in analytics uses raw scores while the leaderboard uses adjusted (post-penalty) scores. The gap is acknowledged in a comment but creates user confusion: an instructor comparing the progression total to the leaderboard total for the same student will see different numbers for IOI contests with late penalties.

---

## No other critical observations

The codebase shows strong consistency in its time-source discipline (DB time for all server-side comparisons), scoring pipeline (canonical `buildIoiLatePenaltyCaseExpr`), and security patterns (no `eval`, no `as any`, DOMPurify sanitization, timing-safe comparisons).
