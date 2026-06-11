# Tracer — Cycle 3 Deep Review (2026-05-01)

**HEAD reviewed:** `894320ff` (main)

## Causal tracing of suspicious flows

### Trace 1: Submission claim flow — judge/claim -> worker -> report

**Path:** `POST /api/v1/judge/claim` -> `isJudgeIpAllowed` -> `isJudgeAuthorized` / `isJudgeAuthorizedForWorker` -> SQL CTE claim -> response with test cases + language config -> worker calls report endpoint

**Observation:** The claim endpoint validates auth twice for worker-scoped claims: once via `isJudgeAuthorizedForWorker` (Bearer token), and again via `safeTokenCompare(hashToken(workerSecret), worker.secretTokenHash)` on lines 112-119. This is defense-in-depth but creates a subtle issue: the Bearer token auth check on line 83 may pass (because the worker has a `secretTokenHash` and the token matches), but the body-level `workerSecret` check on line 116 may fail (because the request body's `workerSecret` doesn't hash to the stored value). These are two different secrets being validated, and the Bearer token is checked first. If the Bearer token is valid but the body `workerSecret` is wrong, the request is rejected at line 118 with "invalidWorkerSecret" (403), which is correct.

**Hypothesis:** Could an attacker with the shared `JUDGE_AUTH_TOKEN` (Bearer) bypass the worker-specific `workerSecret` check? **No** — lines 112-119 explicitly check the body `workerSecret` against `secretTokenHash` even after Bearer auth passes. The Bearer token and body secret are orthogonal.

**Verdict:** The flow is correct. No bypass path found.

### Trace 2: Exam session creation — time boundary race

**Path:** `startExamSession` -> `rawQueryOne("SELECT NOW()")` -> check `startsAt` / `deadline` -> check existing session -> insert with `onConflictDoNothing` -> re-fetch

**Observation:** The function uses `SELECT NOW()` within the same transaction as the temporal checks, which is correct for avoiding clock skew. However, the `onConflictDoNothing` on line 101 means that if two concurrent requests for the same (assignmentId, userId) pair both pass the temporal checks and reach the INSERT, one will succeed and the other will silently do nothing. The re-fetch on line 104 then returns the existing session for both. This is correct idempotent behavior.

**Hypothesis:** Could a student start an exam session after the deadline by exploiting the race between the NOW() check and the INSERT? **Unlikely** — both happen within the same PostgreSQL transaction, and `SELECT NOW()` returns the transaction start time (not statement time), so the temporal check is consistent.

**Verdict:** The flow is correct and race-safe.

### Trace 3: Scoring SQL — late penalty calculation

**Path:** `buildIoiLatePenaltyCaseExpr` -> interpolated into SQL in `contest-scoring.ts` and `leaderboard.ts`

**Observation:** The SQL uses `@deadline`, `@latePenalty`, `@examMode` as parameterized values (bound via Drizzle's `sql` template), while column names are string-interpolated. The parameters are safe (bound values), but column names are not validated. This matches C3-SEC-1 / C3-CR-2.

**Verdict:** Parameterized values are safe. Column name interpolation is the only risk vector, and current callers are safe.

## Final sweep

All critical flows traced. No new bypass paths found. The codebase's auth and temporal checks are robust.
