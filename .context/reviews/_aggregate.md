# RPF Loop Cycle 2 — Aggregate Review (2026-05-04)

**Date:** 2026-05-04
**HEAD reviewed:** `ef102367` (main, post-cycle-1 close-out)
**Prior aggregate:** Cycle 1 (HEAD `37a4a8c3`) preserved at
`.context/reviews/_aggregate-prior-cycle-1.md`.
**Reviewers (10 lanes, single-orchestrator multi-perspective pass):**
code-reviewer, security-reviewer, perf-reviewer, critic, verifier,
test-engineer, tracer, architect, debugger, document-specialist,
designer (designer covered as web frontend exists).

Per-agent files: `.context/reviews/rpf-loop-cycle-2-<agent>.md`.

---

## Cycle-1 → cycle-2 follow-through (carry status)

| Cycle-1 ID | Title | HEAD status | Evidence |
|------------|-------|-------------|----------|
| C1-AGG-1 | 28 unit-test failures | RESOLVED | `npm run test:unit` 2231/2231 |
| C1-AGG-2 | recruit-results scoring math | RESOLVED | `mapSubmissionPercentageToAssignmentPoints` used at line 198 |
| C1-AGG-3 | pre-restore snapshot 0o600 mode | RESOLVED | `createWriteStream(fullPath, { mode: 0o600 })` |
| C1-AGG-4 | pre-restore streaming | RESOLVED | `pipeline(Readable.fromWeb(counted), createWriteStream...)` |
| C1-AGG-5 | judge auth %s placeholder | RESOLVED | line 95-98 no longer contains `%s` |
| C1-AGG-6 | docker config-error env-var leak | RESOLVED | `WORKER_DOCKER_API_CONFIG_ERROR_CODE = "configError"` |
| C1-AGG-7 | data-retention serial prune | RESOLVED | `Promise.allSettled` at lines 101-107 |
| C1-AGG-8 | participant-status accepted comment | RESOLVED | comment + branch at lines 99-109 |
| C1-AGG-9 | snapshot prune fire-and-forget | OPEN (LOW) — no behaviour issue |
| C1-AGG-10 | submission-form lastSnapshotRef reset | OPEN (LOW) — defer |
| C1-AGG-11 | submission-form unmount mid-fetch | OPEN (LOW) — defer |
| C1-AGG-12 | Korean letter-spacing rule drift | NO DRIFT |
| C1-AGG-13 | AGENTS.md TOC | OPEN (carry) |
| C1-AGG-14 | source-grep test brittleness | OPEN (carry) |
| C1-AGG-15 | pre-restore-snapshot module location | OPEN (carry) |
| C1-AGG-16 | recruit-results monolithic component | OPEN (carry) |
| C1-AGG-17 | compiler/execute size | OPEN (carry, 855 lines) |
| C1-AGG-18 | recruit empty-state copy | OPEN — see DSGN2-1 |
| C1-AGG-19 | submission 4s confirm toast | OPEN (carry) |
| C1-AGG-20 | public-header md→lg breakpoint | RESOLVED |
| C1-AGG-21 | SECURITY.md pre-restore mention | OPEN — see DS2-2 |
| C1-AGG-22 | aggregate ID index | OPEN (carry) |
| C1-AGG-23 | RETAIN_LAST_N rationale | RESOLVED (JSDoc landed cycle-1) |
| C1-AGG-24 | pre-restore unit test | OPEN (carry, env-blocked) |
| C1-AGG-25 | recruit-results totalScore test | OPEN — see TE2-2 |

---

## NEW deduplicated findings this cycle

**Severity tally (NEW only):** 0 HIGH, 0 MEDIUM, 9 LOW.

### C2-AGG-1: [LOW] `validateSqlColumnName` rejection-path test gap

- **Sources:** code-reviewer (CR2-1), critic (CRIT2-1), verifier (VER2-1),
  test-engineer (TE2-1), security-reviewer (SEC2-1)
- **File:** `src/lib/assignments/scoring.ts:60-81`
- **Description:** Cycle-3 added `validateSqlColumnName` as a security
  guard for SQL column-name injection. The validator works (callers
  pass safe literals; rejection regex blocks `;`, `--`, `/* */`,
  `'`, `"`, `\`, and the DELETE/DROP/INSERT/UPDATE/ALTER/CREATE/EXEC/
  EXECUTE keywords). However:
  1. `tests/unit/assignments/scoring.test.ts` does not exercise any
     rejection path. A future regex tweak could silently weaken the
     guard with no test failure.
  2. The blocklist does not include `TRUNCATE`, `GRANT`, `REVOKE`,
     `MERGE`, `CALL`, `LOCK`. Practical exposure is zero (current
     callers all pass hardcoded literals) but defence-in-depth would
     prefer an allowlist.
- **Confidence:** HIGH (5-lane convergence)
- **Failure scenario:** Engineer relaxes the regex to allow a new
  pattern; accidentally widens the gate; no test catches it. (No
  active SQL-injection path at HEAD per tracer Trace 2.)
- **Fix:**
  1. Add 6+ negative-path tests in
     `tests/unit/assignments/scoring.test.ts` asserting rejection of
     `";DROP TABLE"`, `"' OR 1=1"`, `"--injection"`, `"/*injection*/"`,
     `"\\"`, and dangerous-keyword variants.
  2. Add 3 positive-path tests pinning the safe baseline accepted
     forms.
  3. (Optional, deferred): tighten to an allowlist regex per SEC2-1
     proposal — track separately if implemented.

### C2-AGG-2: [LOW] `pre-restore-snapshot.ts` partial-write file not unlinked on pipeline failure

- **Source:** debugger (DBG2-1)
- **File:** `src/lib/db/pre-restore-snapshot.ts:97-112`
- **Description:** If the export stream errors mid-pipeline, the
  partial file remains on disk at mode 0o600. A later restore
  operation could see this corrupt file as the "latest snapshot"
  and produce confusion.
- **Confidence:** MEDIUM
- **Fix:** In the `catch` block (line 109), attempt
  `await unlink(fullPath).catch(() => {})` before returning null.

### C2-AGG-3: [LOW] `pre-restore-snapshot.ts` byte-counter wrapper is non-minimal code

- **Sources:** code-reviewer (CR2-3), perf-reviewer (PERF2-1),
  critic (CRIT2-2), tracer (Trace 1)
- **File:** `src/lib/db/pre-restore-snapshot.ts:71-100`
- **Description:** Custom `NodeReadableStream` wrapper exists only
  to count bytes for a single `logger.info` field. A `stat()` after
  the pipeline closes would yield the same number with less code.
- **Confidence:** HIGH (4-lane convergence)
- **Fix:** Drop the wrapper; use `pipeline(Readable.fromWeb(webStream),
  createWriteStream(fullPath, { mode: 0o600 }))` followed by
  `const sizeBytes = (await stat(fullPath)).size;`.

### C2-AGG-4: [LOW] Recruit-results page two sequential SELECTs

- **Source:** perf-reviewer (PERF2-2), verifier (VER2-2)
- **File:** `src/app/(auth)/recruit/[token]/results/page.tsx:137-167`
- **Description:** `assignmentProblemRows` and `submissionRows` are
  awaited sequentially. They depend only on `assignment.id` and can
  run in parallel via `Promise.all`. Saves ~30-40ms cold.
- **Confidence:** MEDIUM
- **Fix:** Wrap both in `await Promise.all([...])`.

### C2-AGG-5: [LOW] Recruit-results monolithic component (carry-forward C1-AGG-16, restated)

- **Sources:** critic (CRIT2-4), architect (ARCH2-1)
- **File:** `src/app/(auth)/recruit/[token]/results/page.tsx`
- **Description:** Component mixes auth + 2 DB queries + score
  reduction + JSX. The arithmetic should be extracted into a pure
  function so a unit test can pin it without DOM stubs.
- **Confidence:** HIGH (2-lane)
- **Fix:** Extract `computeRecruitResultsTotals(rows, bestByProblem)`
  into `src/lib/assignments/recruiting-results.ts`. Test it
  separately (this is also C1-AGG-25 + TE2-2).

### C2-AGG-6: [LOW] `validateSqlColumnName` JSDoc lacks rejection enumeration

- **Source:** document-specialist (DS2-1)
- **File:** `src/lib/assignments/scoring.ts:60-67`
- **Description:** JSDoc says "blocks dangerous characters" without
  listing them. Future maintainers must reverse-engineer the regex.
- **Confidence:** HIGH
- **Fix:** Append the rejection list to the JSDoc (specific
  characters + keywords).

### C2-AGG-7: [LOW] SECURITY.md does not mention pre-restore snapshots (carry-forward C1-AGG-21)

- **Source:** document-specialist (DS2-2)
- **File:** `SECURITY.md`
- **Description:** Cycle-1 added the secure 0o600/0o700 pre-restore
  snapshot artefact; SECURITY.md does not describe it.
- **Confidence:** HIGH
- **Fix:** Add a short paragraph to SECURITY.md describing the
  artefact path, mode, retention policy, and full-fidelity nature.

### C2-AGG-8: [LOW] `data-retention-maintenance.ts` JSDoc missing failure-isolation note

- **Source:** document-specialist (DS2-4), test-engineer (TE2-5)
- **File:** `src/lib/data-retention-maintenance.ts:86-115`
- **Description:** Cycle-1 fix uses `Promise.allSettled` so a single
  prune failure does not abort others. The function-level JSDoc
  does not document this behaviour. Operators reading the function
  signature will not know.
- **Confidence:** MEDIUM
- **Fix:** Add a `@remarks Failure isolation: ...` block to the
  function-level JSDoc.

### C2-AGG-9: [LOW] Recruit-results "no problems" empty state

- **Sources:** debugger (DBG2-3), designer (DSGN2-1), test-engineer
- **File:** `src/app/(auth)/recruit/[token]/results/page.tsx:217-227`
- **Description:** If `totalPossible === 0` (assignment with no
  problems — recruiter-setup edge case), the score card renders
  `0 / 0`. No empty-state copy.
- **Confidence:** LOW
- **Fix:** Wrap the score card in `showScores && totalPossible > 0`,
  rendering an empty-state message otherwise.

---

## Path drift / count drift corrections this cycle

| Carry-forward ID | Prior count/path | Updated at HEAD `ef102367` |
|---|---|---|
| C1-AGG-3 (carry) | client console.error sites (27) | NOT VERIFIED this cycle (not in the new finding scope) |
| C1-AGG-17 (carry) | `compiler/execute.ts` 852 lines | **855 lines** at HEAD (slow growth, +3) |

---

## Carry-forward DEFERRED items (status verified at HEAD `ef102367`)

| ID | Severity | File+line | Status | Exit criterion |
|---|---|---|---|---|
| C3-AGG-5 | LOW | `deploy-docker.sh` whole | DEFERRED | Modular extraction OR >1500 lines |
| C3-AGG-6 | LOW | `deploy-docker.sh:182-191` | DEFERRED | Multi-tenant deploy host |
| C2-AGG-5 (cycle-3) | LOW | 5 polling components | DEFERRED | Telemetry signal OR 7th instance |
| C2-AGG-6 (cycle-3) | LOW | `practice/page.tsx:417` | DEFERRED | p99 > 1.5s OR >5k matching problems |
| C1-AGG-3 (cycle-3) | LOW | client console.error sites | DEFERRED | Telemetry/observability cycle |
| C5-SR-1 | LOW | `scripts/deploy-worker.sh:101-107` | DEFERRED | Untrusted-source APP_URL |
| DEFER-ENV-GATES | LOW | env-blocked tests | DEFERRED | Fully provisioned CI/host |
| D1 | MEDIUM | `src/lib/auth/...` JWT clock-skew | DEFERRED | Auth-perf cycle |
| D2 | MEDIUM | `src/lib/auth/...` JWT DB query per request | DEFERRED | Auth-perf cycle |
| AGG-2 | MEDIUM | (resolved via in-memory deletion) | RESOLVED | -- |
| ARCH-CARRY-1 | MEDIUM | 20 raw of 104 API route handlers | DEFERRED | API-handler refactor cycle |
| ARCH-CARRY-2 | LOW | `realtime-coordination.ts` + SSE route | DEFERRED | SSE perf cycle OR >500 concurrent |
| PERF-3 | MEDIUM | Anti-cheat heartbeat query | DEFERRED | Anti-cheat p99 > 800ms OR >50 contests |
| C7-AGG-6 | LOW | `participant-status.ts` time-boundary tests | DEFERRED | Bug report on deadline boundary |
| C7-AGG-7 | LOW | `encryption.ts:79-81` decrypt plaintext fallback | DEFERRED-with-doc-mitigation | Production tampering incident OR audit cycle |
| C7-AGG-9 | LOW | Rate-limit duplication | DEFERRED-with-doc-mitigation (one fewer module than cycle-3) | Rate-limit consolidation cycle |
| C1-AGG-4 | LOW | `compiler/execute.ts:660` chmod 0o770 | DEFERRED | Security audit OR operator reports |
| C3-AGG-7 | LOW | `participant-status.ts` `now` time branding | DEFERRED | Type-strictness pass |
| C3-AGG-8 | LOW | `scoring.ts` mixed-abstraction split | DEFERRED | Next touch of `scoring.ts` |
| C3-AGG-9 / C1-AGG-17 | LOW | `compiler/execute.ts` size | DEFERRED | >1000 lines OR judge-runtime feature |

No HIGH findings deferred. No security/correctness/data-loss findings deferred (DBG2-1 / C2-AGG-2 is data-loss-adjacent and is being **scheduled**, not deferred).

---

## Cross-agent agreement summary

- **C2-AGG-1 (`validateSqlColumnName` test gap)**: 5-lane (CR + CRIT + VER + TE + SEC). Highest signal LOW.
- **C2-AGG-3 (byte-counter wrapper non-minimal)**: 4-lane (CR + PERF + CRIT + TR).
- **C2-AGG-5 (recruit-results monolith)**: 2-lane (CRIT + ARCH).
- **C2-AGG-7 (SECURITY.md pre-restore mention)**: 1-lane (DS); carry-forward C1-AGG-21.
- **C2-AGG-8 (data-retention failure-isolation note)**: 2-lane (DS + TE).
- **C2-AGG-9 (recruit-results empty state)**: 3-lane (DBG + DSGN + TE).

No new HIGH findings. No new MEDIUM findings. All 9 NEW findings are
LOW. The codebase entered cycle-2 in a stable state after cycle-1's
broad test-gate triage and 7 source-level fixes; cycle-2's review
surface is correspondingly quiet.

## Agent failures

None this cycle. All 10 reviewer perspectives produced artifacts in
`.context/reviews/rpf-loop-cycle-2-<agent>.md`.

---

## Suggested PROMPT 3 priority order

1. **C2-AGG-1 (validateSqlColumnName tests)** — highest cross-agent
   agreement (5-lane), security guard with no negative coverage.
2. **C2-AGG-2 (snapshot partial-write unlink)** — data-loss-adjacent;
   scheduled rather than deferred.
3. **C2-AGG-3 (byte-counter wrapper simplification)** — 4-lane
   convergence, code-quality cleanup.
4. **C2-AGG-6 (validateSqlColumnName JSDoc enumeration)** — pairs with
   C2-AGG-1.
5. **C2-AGG-8 (data-retention JSDoc remarks)** — 2-lane.
6. **C2-AGG-7 (SECURITY.md mention)** — completes carry-forward
   C1-AGG-21.
7. **C2-AGG-4 (recruit-results parallel SELECTs)** — small perf win.
8. **C2-AGG-9 (recruit-results empty state)** — UX polish.
9. **C2-AGG-5 (recruit-results monolith extract)** — depends on
   choosing whether to land it as part of cycle-2 or defer to a
   refactor cycle.
