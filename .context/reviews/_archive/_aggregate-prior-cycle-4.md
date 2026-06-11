# RPF Loop Cycle 3 — Aggregate Review (2026-05-03)

**Date:** 2026-05-03
**HEAD reviewed:** `dafc0b24` (main, post-cycle-2 close-out)
**Prior aggregate:** Cycle 2 (HEAD `ef102367`) preserved at
`.context/reviews/_aggregate-prior-cycle-1.md` and at
`.context/reviews/_aggregate.md` (cycle-2 contents).

**Reviewers (10 lanes + comprehensive synthesis, single-orchestrator
multi-perspective pass):** code-reviewer, security-reviewer,
perf-reviewer, critic, verifier, test-engineer, tracer, architect,
debugger, document-specialist, designer (web-frontend present),
comprehensive-review (cross-cut synthesis).

Per-agent files: `.context/reviews/rpf-loop-cycle-3-<agent>.md`.

---

## Cycle-2 → cycle-3 follow-through (carry status)

| Cycle-2 ID | Title | HEAD status | Evidence |
|------------|-------|-------------|----------|
| C2-AGG-1 | validateSqlColumnName test gap | RESOLVED | `tests/unit/assignments/scoring.test.ts:122-221` (12 negative-path tests, 2 positive baseline) |
| C2-AGG-2 | snapshot partial-write unlink | RESOLVED | `src/lib/db/pre-restore-snapshot.ts:107` |
| C2-AGG-3 | byte-counter wrapper drop | RESOLVED | `src/lib/db/pre-restore-snapshot.ts:94` `stat(fullPath).catch(() => null)?.size ?? 0` |
| C2-AGG-4 | recruit-results parallel SELECTs | RESOLVED | `src/app/(auth)/recruit/[token]/results/page.tsx:140-171` |
| C2-AGG-5 | recruit-results monolith | OPEN (LOW, lifted) — see CYC3-AGG-2 |
| C2-AGG-6 | validateSqlColumnName JSDoc enumeration | RESOLVED | `src/lib/assignments/scoring.ts:66-77` |
| C2-AGG-7 | SECURITY.md pre-restore mention | RESOLVED | `SECURITY.md:50-73` |
| C2-AGG-8 | data-retention JSDoc remarks | RESOLVED | `src/lib/data-retention-maintenance.ts:94-105` |
| C2-AGG-9 | recruit-results empty state guard | RESOLVED | `src/app/(auth)/recruit/[token]/results/page.tsx:225` |
| C1-AGG-9 | snapshot prune fire-and-forget | OPEN (LOW) — defer (no behaviour issue) |
| C1-AGG-10 / 11 | submission-form lastSnapshotRef + unmount | OPEN (LOW) — defer |
| C1-AGG-13 | AGENTS.md TOC | OPEN (LOW) — defer (writer cycle) |
| C1-AGG-14 | source-grep test brittleness | OPEN (LOW) — defer |
| C1-AGG-15 | pre-restore-snapshot module location | OPEN (LOW) — defer |
| C1-AGG-16 | recruit-results monolith (== C2-AGG-5) | -- (subsumed by CYC3-AGG-2) |
| C1-AGG-17 | compiler/execute size | OPEN (LOW, 855 lines) — defer |
| C1-AGG-19 | submission 4s confirm toast | OPEN (LOW) — defer |
| C1-AGG-22 | aggregate ID index | OPEN (LOW) — defer |
| C1-AGG-24 | pre-restore-snapshot unit test | OPEN (LOW) — see CYC3-AGG-3 (proposing TS-only test, no DB) |
| All other carry-forwards | -- | retained, no drift |

---

## NEW deduplicated findings this cycle

**Severity tally (NEW only):** 0 HIGH, 0 MEDIUM, 7 LOW.

### CYC3-AGG-1: [LOW] `pre-restore-snapshot.ts` stat() fallback conflates "stat failed" with "file empty"

- **Sources:** code-reviewer (CR3-1), critic (CRIT3-1), verifier
  (VER3-3), debugger (DBG3-1) — **4-lane convergence**
- **File:** `src/lib/db/pre-restore-snapshot.ts:94`
- **Code:** `const sizeBytes = (await stat(fullPath).catch(() => null))?.size ?? 0;`
- **Description:** When `stat()` fails (e.g., file deleted between
  pipeline-close and stat by another process, transient FS error),
  the success log line records `sizeBytes: 0`. An operator reading
  the log cannot distinguish "stat failed" from "actually empty
  file". The pipeline produces a real file in the success path —
  size 0 in the log is misleading.
- **Confidence:** MEDIUM (clarity, not correctness)
- **Failure scenario:** Operator audits the snapshot log, sees a
  successful "pre-restore snapshot written" line with `sizeBytes:
  0`, reasons that the snapshot is empty, deletes the file. The file
  was actually fine; the stat just transient-failed.
- **Fix:** Split the fallback into a separate branch:
  ```ts
  const stStat = await stat(fullPath).catch(() => null);
  const sizeBytes = stStat?.size ?? null;
  if (sizeBytes === null) {
    logger.warn({ path: fullPath, actorId },
      "[restore] snapshot written but size unavailable (stat failed)");
  } else {
    logger.info({ path: fullPath, sizeBytes, actorId },
      "[restore] pre-restore snapshot written");
  }
  ```
  Or simpler: keep the success log but add a separate `stat()` failure warn
  inline.

### CYC3-AGG-2: [LOW] Recruit-results scoring extract — lift cycle-2 deferral

- **Sources:** critic (CRIT3-3), architect (ARCH3-3), test-engineer
  (TE3-4), comprehensive-review (CMP3-2) — **4-lane convergence**
- **File:** `src/app/(auth)/recruit/[token]/results/page.tsx:174-206`
- **Description:** Cycle-2 deferred the monolith extraction with
  exit criterion "next touch of recruit-results". Cycle-2 then
  touched the file twice (TASK-7, TASK-8). Critic argues the
  deferral should be lifted; tests argue the math should be
  testable in isolation; architect argues abstraction layering.
- **Confidence:** HIGH (4-lane)
- **Failure scenario:** Another regression like the C1-AGG-2
  units-mismatch (raw % summed instead of weighted points) ships
  because the math is hidden inside a 300-line server component
  with no unit test.
- **Fix:**
  1. Create `src/lib/assignments/recruiting-results.ts` with a pure
     function:
     ```ts
     export function computeRecruitResultsTotals(
       assignmentProblemRows: Array<{ problemId: string; points: number | null }>,
       bestByProblem: Map<string, { score: number | null }>,
     ): { totalScore: number; totalPossible: number; adjustedByProblem: Map<string, number>; }
     ```
  2. Move the reduction loop (lines 194-206) into the helper.
  3. Add `tests/unit/assignments/recruiting-results.test.ts` with
     5+ scenarios: full perfect, mixed scores, all-zero, no
     submissions, null score handling, weighted vs unweighted
     points (the C1-AGG-2 regression scenario).
  4. Page imports the helper and replaces the inline loop with a
     call.

### CYC3-AGG-3: [LOW] Pre-restore-snapshot has no FS-only unit test

- **Sources:** test-engineer (TE3-2 + TE3-6 + TE3-7),
  comprehensive-review (CMP3-3) — **2-lane convergence**
- **File:** missing `tests/unit/db/pre-restore-snapshot.test.ts`
- **Description:** Carry-forward C1-AGG-24 was deferred under
  DEFER-ENV-GATES because it was assumed to need a real DB. TE3-2
  observes a no-DB unit test is feasible by mocking
  `streamDatabaseExport` with a tiny in-memory ReadableStream. The
  test would assert: file mode 0o600, filename pattern, prune
  retention=5, and unlink-on-error.
- **Confidence:** MEDIUM
- **Failure scenario:** Future maintainer changes the file naming
  pattern (e.g., adds a hash) and breaks the prune regex
  `pre-restore-` prefix without anyone noticing. Or removes the
  unlink-on-error and reintroduces the cycle-2 partial-write bug.
- **Fix:** Land a unit test using `tmp/` + mocked
  `streamDatabaseExport`. Five assertions:
  1. Successful pipeline writes a file with mode 0o600.
  2. Filename pattern matches `pre-restore-<ISO>-<8-char>.json`.
  3. Multiple invocations + prune keeps the most recent
     `RETAIN_LAST_N=5`.
  4. Mocked stream-error path triggers `unlink` of the partial file.
  5. Mocked chmod failure on dir does not abort the snapshot.

### CYC3-AGG-4: [LOW] `validateSqlColumnName` JSDoc lead-with-contract

- **Sources:** critic (CRIT3-2), document-specialist (DS3-1),
  security-reviewer (SR3-2) — **3-lane convergence**
- **File:** `src/lib/assignments/scoring.ts:60-95`
- **Description:** The JSDoc lists rejected characters/keywords
  before the caller-contract. A reader scanning top-down may read
  the rejection list as the *primary* defence rather than a
  defence-in-depth backstop. The actual contract — "callers MUST
  pass only hardcoded literals" — is buried in the `@security`
  block at line 79-82.
- **Confidence:** MEDIUM
- **Fix:** Restructure JSDoc to lead with the caller-contract
  ("PRIMARY: callers MUST pass only hardcoded string literals or
  Drizzle column reference names. NEVER pass user-influenced
  input."), then describe the validator as defence-in-depth, then
  list rejected patterns. Optional polish.

### CYC3-AGG-5: [LOW] `data-retention-maintenance.ts` failure-isolation has no behavioural test

- **Sources:** test-engineer (TE3-3) — **1-lane**
- **File:** missing test
- **Description:** Carry-forward TE2-5 / DBG2-2. The fix landed in
  cycle-1 (`Promise.allSettled`). The contract is documented in
  cycle-2 (TASK-5). But no test asserts it. A unit test that mocks
  one of the prune helpers to throw and verifies (a) the others
  still run, (b) `logger.warn` is called with the rejection reason,
  and (c) the function does not throw.
- **Confidence:** LOW
- **Fix:** Land a unit test in
  `tests/unit/data-retention-maintenance.test.ts` (create if
  missing) that mocks one of the prune helpers (e.g., spy on
  `batchedDelete`) to throw, verifies `Promise.allSettled`
  semantics, and asserts the warn log is emitted.

### CYC3-AGG-6: [LOW] `mapSubmissionPercentageToAssignmentPoints` does not guard against NaN

- **Sources:** debugger (DBG3-5) — **1-lane**
- **File:** `src/lib/assignments/scoring.ts:28`
- **Description:** `Math.min(Math.max(score, 0), 100)`. If `score`
  is `NaN`, `Math.max(NaN, 0)` = `NaN`, `Math.min(NaN, 100)` =
  `NaN`, and the rounded result is `NaN`. Practical exposure is
  zero (DB returns numbers or null), but a future caller passing a
  parsed-string could trigger NaN propagation through the page
  rendering as "NaN / 75".
- **Confidence:** LOW
- **Fix:** Add `if (!Number.isFinite(score)) return 0;` guard at the
  top of the function (post-`normalizedPercentage`, pre-multiply).

### CYC3-AGG-7: [LOW] `SQL_COLUMN_DANGEROUS_RE` blocklist incomplete (TRUNCATE/GRANT/REVOKE/MERGE missing)

- **Sources:** code-reviewer (CR3-3), security-reviewer (SR3-2) —
  **2-lane convergence**
- **File:** `src/lib/assignments/scoring.ts:85`
- **Description:** Cycle-2 considered tightening the blocklist
  (deferred under C2-AGG-1 "optional"). The pattern still misses
  `TRUNCATE`, `GRANT`, `REVOKE`, `MERGE`, `CALL`, `LOCK`. Practical
  exposure remains zero (callers all pass hardcoded literals).
- **Confidence:** LOW (no active vulnerability, defence-in-depth)
- **Fix:** Either tighten to allowlist regex (recommended) or add
  the missing keywords. Defer if the JSDoc lead-with-contract
  (CYC3-AGG-4) is implemented and explicitly states the blocklist
  is non-exhaustive defence-in-depth.

---

## Path drift / count drift corrections this cycle

| Carry-forward ID | Prior count/path | Updated at HEAD `dafc0b24` |
|---|---|---|
| C1-AGG-17 | `compiler/execute.ts` 855 lines | NOT VERIFIED this cycle (out of new-finding scope) |

---

## Carry-forward DEFERRED items (status verified at HEAD `dafc0b24`)

| ID | Severity | File+line | Status | Exit criterion |
|---|---|---|---|---|
| C3-AGG-5 | LOW | `deploy-docker.sh` whole | DEFERRED | Modular extraction OR >1500 lines |
| C3-AGG-6 | LOW | `deploy-docker.sh:182-191` | DEFERRED | Multi-tenant deploy host |
| C2-AGG-5 (cycle-3) | LOW | 5 polling components | DEFERRED | Telemetry signal OR 7th instance |
| C2-AGG-6 (cycle-3) | LOW | `practice/page.tsx:417` | DEFERRED | p99 > 1.5s OR >5k matching problems |
| C1-AGG-3 (cycle-3) | LOW | client console.error sites | DEFERRED | Telemetry/observability cycle |
| C5-SR-1 | LOW | `scripts/deploy-worker.sh:101-107` | DEFERRED | Untrusted-source APP_URL |
| DEFER-ENV-GATES | LOW | env-blocked tests (e2e) | DEFERRED | Fully provisioned CI/host |
| D1 | MEDIUM | JWT clock-skew (NOT `auth/config.ts`) | DEFERRED | Auth-perf cycle |
| D2 | MEDIUM | JWT DB query per request (NOT `auth/config.ts`) | DEFERRED | Auth-perf cycle |
| ARCH-CARRY-1 | MEDIUM | 20 raw of 104 API route handlers | DEFERRED | API-handler refactor cycle |
| ARCH-CARRY-2 | LOW | `realtime-coordination.ts` + SSE route | DEFERRED | SSE perf cycle OR >500 concurrent |
| PERF-3 | MEDIUM | Anti-cheat heartbeat query | DEFERRED | Anti-cheat p99 > 800ms OR >50 contests |
| C7-AGG-6 | LOW | `participant-status.ts` time-boundary tests | DEFERRED | Bug report on deadline boundary |
| C7-AGG-7 | LOW | `encryption.ts:79-81` decrypt plaintext fallback | DEFERRED-with-doc-mitigation | Production tampering incident OR audit cycle |
| C7-AGG-9 | LOW | Rate-limit duplication | DEFERRED-with-doc-mitigation | Rate-limit consolidation cycle |
| C1-AGG-4 | LOW | `compiler/execute.ts:660` chmod 0o770 | DEFERRED | Security audit OR operator reports |
| C3-AGG-7 | LOW | `participant-status.ts` `now` time branding | DEFERRED | Type-strictness pass |
| C3-AGG-8 | LOW | `scoring.ts` mixed-abstraction split | DEFERRED | Next non-trivial scoring-rule change |
| C3-AGG-9 / C1-AGG-17 | LOW | `compiler/execute.ts` size | DEFERRED | >1000 lines OR judge-runtime feature |
| C1-AGG-9 | LOW | snapshot prune fire-and-forget | DEFERRED | Cycle that touches the prune codepath |
| C1-AGG-10 / C1-AGG-11 | LOW | `submission-form.tsx` lastSnapshotRef + unmount | DEFERRED | Submission-form refactor cycle |
| C1-AGG-13 | LOW | AGENTS.md TOC | DEFERRED | Writer cycle |
| C1-AGG-14 | LOW | source-grep test brittleness | DEFERRED | Source-grep replacement cycle |
| C1-AGG-15 | LOW | pre-restore-snapshot.ts module location | DEFERRED | Ops-tooling consolidation cycle |
| C1-AGG-19 | LOW | submission 4s confirm toast | DEFERRED | Submission-form polish cycle |
| C1-AGG-22 | LOW | aggregate ID index | DEFERRED | Doc-tooling cycle |
| SEC2-2 | LOW | snapshot filename actor-id slice | DEFERRED | Multi-tenant deploy OR leak report |
| SEC2-3 | LOW | judge auth log workerId | DEFERRED | Operator log-spam OR auth-perf cycle |
| DSGN3-1 | LOW | recruit-results 0-problems empty-state copy | DEFERRED | Recruiter UI prevents 0-problem at submit |
| DSGN3-2 | LOW | recruit-results per-problem empty-state | DEFERRED | UX-cycle |
| CYC3-AGG-7 | LOW | scoring.ts blocklist TRUNCATE/GRANT/etc | DEFERRED-with-JSDoc-mitigation | Non-literal caller introduced |

No HIGH findings deferred. No security/correctness/data-loss findings
deferred unjustifiably.

---

## Cross-agent agreement summary

- **CYC3-AGG-1 (stat() fallback)**: 4-lane (CR + CRIT + VER + DBG).
  Highest signal LOW.
- **CYC3-AGG-2 (recruit-results extract — lift deferral)**: 4-lane
  (CRIT + ARCH + TE + CMP).
- **CYC3-AGG-3 (pre-restore-snapshot unit test)**: 2-lane (TE +
  CMP).
- **CYC3-AGG-4 (validateSqlColumnName JSDoc lead)**: 3-lane (CRIT +
  DS + SR).
- **CYC3-AGG-5 (data-retention failure-isolation test)**: 1-lane
  (TE).
- **CYC3-AGG-6 (NaN guard)**: 1-lane (DBG).
- **CYC3-AGG-7 (blocklist incomplete)**: 2-lane (CR + SR).

No new HIGH findings. No new MEDIUM findings. All 7 NEW findings are
LOW. The codebase entered cycle-3 in a stable state after cycle-2's
8-task close-out; cycle-3's review surface is correspondingly quiet.

## Agent failures

None this cycle. All 11 reviewer perspectives produced artifacts in
`.context/reviews/rpf-loop-cycle-3-<agent>.md`. Designer was a
source-only review (runtime env-blocked).

---

## Suggested PROMPT 3 priority order

1. **CYC3-AGG-1 (stat() fallback split)** — 4-lane convergence, easy
   fix, log-clarity for ops.
2. **CYC3-AGG-2 (recruit-results extract)** — 4-lane, lifts
   2-cycle-old deferral, enables unit testing.
3. **CYC3-AGG-3 (pre-restore-snapshot unit test)** — 2-lane,
   unblocks C1-AGG-24 carry-forward.
4. **CYC3-AGG-4 (validateSqlColumnName JSDoc lead)** — 3-lane, doc
   polish, no behaviour change.
5. **CYC3-AGG-5 (data-retention failure-isolation test)** — 1-lane,
   pins cycle-1 contract.
6. **CYC3-AGG-6 (NaN guard)** — 1-lane, defensive polish.
7. **CYC3-AGG-7 (blocklist tightening)** — defer with JSDoc note
   (covered by CYC3-AGG-4).
