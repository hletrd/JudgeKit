# RPF Loop Cycle 1 — Aggregate Review (2026-05-03)

**Date:** 2026-05-03
**HEAD reviewed:** `37a4a8c3` (main)
**Prior aggregate:** Cycle 3 (HEAD `894320ff`) — preserved at `.context/reviews/_aggregate-prior-cycle-3.md`.
**Reviewers (10 lanes, single-orchestrator multi-perspective pass):** test-engineer, code-reviewer, security-reviewer, perf-reviewer, architect, debugger, critic, verifier, tracer, designer, document-specialist.

---

## Cycle-3 → cycle-1 follow-through (carry status)

| Cycle-3 ID | Title | HEAD status | Evidence |
|------------|-------|-------------|----------|
| C3-AGG-1 | participant-status null → "submitted" | RESOLVED | `participant-status.ts:99-105` adds null→pending branch; new test added |
| C3-AGG-2 | scoring.ts column injection | RESOLVED | `scoring.ts:60-81` adds `validateSqlColumnName` |
| C3-AGG-3 | in-memory rate-limit BACKOFF_CAP drift | RESOLVED via deletion | Module deleted (commit `a197bde8`) |
| C3-AGG-4 | in-memory rate-limit no test | RESOLVED via deletion | Same as above |
| C3-AGG-5 | visibility N+1 | OPEN | `visibility.ts:90-99` unchanged |
| C3-AGG-6 | compiler/execute pLimit unbounded | OPEN (deferred) | `execute.ts:381` unchanged |
| C3-AGG-7 | participant-status `now` branding | OPEN (LOW, deferred) | unchanged |
| C3-AGG-8 | scoring.ts mixed-abstraction split | OPEN (LOW, deferred) | unchanged |
| C3-AGG-9 | compiler/execute size split | OPEN (LOW, deferred) | unchanged; also flagged by architect ARCH-3 |

---

## NEW deduplicated findings

**Severity tally (NEW only):** 3 HIGH, 5 MEDIUM, 18 LOW.

### C1-AGG-1: [HIGH] Test gate broken — 28 unit-test failures across 22 files

- **Sources:** test-engineer (TE-1..TE-12), critic (CRIT-1), verifier (VER-evidence), tracer (Trace 3)
- **Description:** The current HEAD ships with 28 failing tests. Categorised:
  - 4 tests assert old API signatures (`validateAndHashPassword(password, ctx)`, `getPasswordValidationError(password, ctx)` — now both 1-arg only) — TE-1, TE-2.
  - 1 test asserts the now-removed shared-token fallback in `isJudgeAuthorizedForWorker` (security-hardened by `909fcbf5`) — TE-3.
  - 1 test asserts the old 200-userId limit on `bulkEnrollmentSchema` (raised to 500) — TE-4.
  - 2 tests assert the old assistant capability bag (still includes `submissions.view_all` — but `246822fa` removed it) — TE-5, TE-6.
  - 1 test asserts that IPv6 CIDR doesn't match (commit `12417fa9` added IPv6 CIDR support) — TE-7.
  - 2 tests for the bulk-members route assume the old single-input shape (now accepts `usernames` too) — TE-8.
  - 3 tests in `use-source-draft.test.ts` fail with no obvious recent commit — TE-9 / DBG-2.
  - 3 tests in `infra/deploy-security.test.ts` drifted vs. compose changes — TE-10.
  - 12 source-grep `*-implementation.test.ts` tests drifted vs. UI/source refactors — TE-11, including TE-12 (md→lg breakpoint).
- **Confidence:** HIGH (verified by full test run; 28 named failures captured)
- **Action:** PROMPT 3 must triage and fix all 28. NO test may be deleted without confirming the source-level invariant it guards is moved elsewhere or no longer applicable.

### C1-AGG-2: [HIGH] `recruit/[token]/results/page.tsx` total-score arithmetic mixes percentage and points

- **Sources:** code-reviewer (CR-1), debugger (DBG-1), tracer (Trace 1), designer (DSGN-1), critic (CRIT-2)
- **File:** `src/app/(auth)/recruit/[token]/results/page.tsx:183-191, 261-263`
- **Description:** `submissions.score` is a percentage (0-100); `assignmentProblems.points` is a per-problem weight. The page accumulates raw `score` into `totalScore` and `points` into `totalPossible`, then displays them side-by-side. Result: a candidate who scores 80 on three 25-point problems sees `240 / 75`. Per-problem display row at line 263 has the same units mismatch. The codebase has a canonical helper `mapSubmissionPercentageToAssignmentPoints` and SQL helper `buildIoiLatePenaltyCaseExpr` for exactly this conversion; the recruit page bypasses both.
- **Confidence:** HIGH (5-lane cross-agreement)
- **Failure scenario:** Recruiting candidates and recruiters see incoherent totals on the candidate-facing recruit results page — the final candidate-facing surface in the recruiting flow.
- **Fix:** Use `mapSubmissionPercentageToAssignmentPoints` to convert `best.score` to per-problem points before accumulation and display.

### C1-AGG-3: [MEDIUM] `pre-restore-snapshot.ts` writes full-fidelity DB dump without restrictive file mode

- **Source:** security-reviewer (SEC-2)
- **File:** `src/lib/db/pre-restore-snapshot.ts:23-65`
- **Description:** Snapshot is `sanitize: false` — contains password hashes, encrypted column ciphertexts. `writeFile(fullPath, merged)` honours umask (typically 0022) → file is `0644` (world-readable). Multi-tenant or shared-volume hosts can leak the snapshot to non-privileged users.
- **Confidence:** MEDIUM
- **Fix:** Pass `{ mode: 0o600 }` to `writeFile`. Set the directory mode to `0o700` after `mkdir`.

### C1-AGG-4: [MEDIUM] `pre-restore-snapshot.ts` buffers entire DB export in memory

- **Source:** perf-reviewer (PERF-1)
- **File:** `src/lib/db/pre-restore-snapshot.ts:36-52`
- **Description:** The function buffers all chunks into an array, concatenates into a single buffer of full-export size, then writes. On production-sized DBs this is O(N) memory pressure with a peak doubling during concat. Stream directly to disk via `pipeline(Readable.fromWeb(stream), createWriteStream(fullPath))`.
- **Confidence:** HIGH
- **Fix:** Use `node:stream/promises` `pipeline`.

### C1-AGG-5: [MEDIUM] `judge/auth.ts` warn-log message contains an unsubstituted `%s`

- **Sources:** code-reviewer (CR-6), debugger (DBG-3), document-specialist (DOC-3)
- **File:** `src/lib/judge/auth.ts:92-95`
- **Description:** `logger.warn({ workerId }, "[judge] Worker %s has no secretTokenHash...")`. Pino does not substitute `%s` from the binding object. The literal `%s` lands in the log message.
- **Confidence:** HIGH
- **Fix:** Drop `%s` from the message.

### C1-AGG-6: [MEDIUM] `docker/client.ts` config-error message leaks env-var names to API callers

- **Source:** code-reviewer (CR-3)
- **File:** `src/lib/docker/client.ts:26-30`, returned via `buildDockerImage`/`pullDockerImage`/`removeDockerImage`
- **Description:** The literal `"COMPILER_RUNNER_URL is set but RUNNER_AUTH_TOKEN is missing"` flows back to API callers. Inconsistent with the `CRON_SECRET` no-leak hardening in `metrics/route.ts` (commit `d30c362b`).
- **Confidence:** MEDIUM
- **Fix:** Log the operator-friendly message; return a generic `{ success: false, error: "configError" }` to the API.

### C1-AGG-7: [MEDIUM] `data-retention-maintenance.ts` runs 5 prune jobs serially

- **Source:** perf-reviewer (PERF-2)
- **File:** `src/lib/data-retention-maintenance.ts:96-105`
- **Description:** 5 independent table-prune jobs run sequentially inside a single try/catch. Promise.all would parallelise them.
- **Confidence:** MEDIUM
- **Fix:** Use `Promise.all` for the 5 independent prune calls.

### C1-AGG-8 .. C1-AGG-25 (LOW)

| ID | Title | Source | Status |
|----|-------|--------|--------|
| C1-AGG-8 | `participant-status.ts` accepted-fallthrough → submitted needs comment | CR-2 | LOW |
| C1-AGG-9 | `pre-restore-snapshot.ts` prune runs without await; race risk | CR-4 | LOW |
| C1-AGG-10 | `submission-form.tsx` `lastSnapshotRef` not reset after successful submit | CR-5 | LOW |
| C1-AGG-11 | `submission-form.tsx` snapshot may be lost on unmount mid-fetch | DBG-4 | LOW |
| C1-AGG-12 | Korean letter-spacing rule enforced ad-hoc inline; drift risk | CRIT-4, DSGN-5 | LOW |
| C1-AGG-13 | AGENTS.md is 38KB; needs TOC | CRIT-5 | LOW |
| C1-AGG-14 | Source-grep tests are brittle; convert to behavior tests over time | CRIT-3 | LOW |
| C1-AGG-15 | `pre-restore-snapshot.ts` could move from `lib/db/` to `lib/ops/` | ARCH-2 | LOW |
| C1-AGG-16 | `recruit/[token]/results/page.tsx` reaches into DB schema directly; bypasses `submissions` lib | ARCH-1 | LOW (root cause of C1-AGG-2) |
| C1-AGG-17 | `compiler/execute.ts` size growing | ARCH-3 (carry C3-AGG-9) | LOW |
| C1-AGG-18 | Recruit results lacks empty-state copy when zero submissions | DSGN-3 | LOW |
| C1-AGG-19 | Submission-form 4 s confirm window — toast eviction edge | DSGN-4 | LOW |
| C1-AGG-20 | Public-header md→lg breakpoint compresses tablet visible nav | DSGN-2 | LOW (acceptable tradeoff) |
| C1-AGG-21 | `SECURITY.md` should mention pre-restore snapshot artefact | DOC-1 | LOW |
| C1-AGG-22 | Aggregate-finding IDs lack a reader-friendly index | DOC-2 | LOW |
| C1-AGG-23 | `pre-restore-snapshot.ts` `RETAIN_LAST_N=5` rationale not documented | DOC-4 | LOW |
| C1-AGG-24 | No unit test for `pre-restore-snapshot.ts` | TE-14 | LOW |
| C1-AGG-25 | No unit test for recruit/results totalScore semantics (after C1-AGG-2 fix) | TE-13 | LOW (depends on C1-AGG-2) |

---

## Cross-agent agreement signal

- **C1-AGG-2** flagged by 5 lanes — highest cross-agent agreement → highest signal. Should be the first PROMPT 3 fix after the test-gate.
- **C1-AGG-1** is process-level — broken test gate. PROMPT 3 must fix or this whole loop's verification is invalid.
- **C1-AGG-5** flagged by 3 lanes; mechanically simple to fix.

---

## Suggested PROMPT 3 priority order

1. **Test gate triage (C1-AGG-1)** — without this, no other change can be verified through `npm run test:unit`.
2. **Recruit results scoring (C1-AGG-2)** — user-facing math bug.
3. **`pre-restore-snapshot` mode + streaming (C1-AGG-3 + C1-AGG-4)**.
4. **`judge/auth.ts` log fix (C1-AGG-5)**.
5. **`docker/client.ts` config-error containment (C1-AGG-6)**.
6. **`data-retention-maintenance.ts` parallel prune (C1-AGG-7)**.
7. **LOW items as time permits**.

---

## AGENT FAILURES

None this cycle.
