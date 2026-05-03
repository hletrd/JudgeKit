# RPF Loop Cycle 3 — Review Remediation Plan (2026-05-03)

**HEAD at planning time:** `dafc0b24` (main, post-cycle-2 close-out)
**Source aggregate:** `.context/reviews/_aggregate.md` (cycle 3, also
preserved at `.context/reviews/rpf-loop-cycle-3-aggregate.md`).
**User-injected TODOs:** ingested from
`./user-injected/pending-next-cycle.md` and `./plans/user-injected/`.
The pending file lists **(none at the moment)** for active items;
the workspace-to-public migration TODO is "substantially complete"
with no per-cycle action required. Nothing new to ingest this cycle.

## Repo policy compliance (read at planning time)

- `CLAUDE.md` (project): preserve `src/lib/auth/config.ts` as-is on
  deploy; deploy-mode this cycle is `none`, no concern. Korean
  letter-spacing rule: do not apply `tracking-*` to Korean text — none
  of the cycle-3 fixes touch Korean text.
- `~/.claude/CLAUDE.md` (global): GPG-sign every commit, conventional
  commit + gitmoji, fine-grained commits, pull --rebase before push,
  no Co-Authored-By, latest-stable language/framework versions.
- `AGENTS.md`: documentation-source-of-truth for the 125 language
  list; no language config changes this cycle.

## Done criteria (cycle-level)

- CYC3-AGG-1, CYC3-AGG-2, CYC3-AGG-3, CYC3-AGG-4, CYC3-AGG-5,
  CYC3-AGG-6 implemented.
- CYC3-AGG-7 (blocklist incomplete) covered via CYC3-AGG-4 JSDoc note
  (defence-in-depth disclosed).
- All gates green: `npm run lint`, `npm run lint:bash`, `npm run
  test:unit`, `npm run test:security`, `npm run build`.
- E2E gate attempted; if env-blocked recorded as DEFER-ENV-GATES.

---

## TASKS

### TASK-1 [CYC3-AGG-1, LOW]: Split pre-restore-snapshot stat() fallback to remove sizeBytes:0 ambiguity

- **File to edit:** `src/lib/db/pre-restore-snapshot.ts`
- **Change:** Replace the single-expression `sizeBytes` chain at line
  94 with an explicit two-branch structure:
  ```ts
  const stStat = await stat(fullPath).catch(() => null);
  if (stStat === null) {
    logger.warn(
      { path: fullPath, actorId },
      "[restore] pre-restore snapshot written but size unavailable (stat failed)",
    );
  } else {
    logger.info(
      { path: fullPath, sizeBytes: stStat.size, actorId },
      "[restore] pre-restore snapshot written",
    );
  }
  ```
  This separates the "stat failed" log line from the "actually empty"
  log line so operators reading log output can distinguish the two
  cases.
- **Status:** [ ] Pending

### TASK-2 [CYC3-AGG-2, LOW]: Extract recruit-results scoring to a pure helper + unit test

- **File to create:** `src/lib/assignments/recruiting-results.ts`
- **File to create:** `tests/unit/assignments/recruiting-results.test.ts`
- **File to edit:** `src/app/(auth)/recruit/[token]/results/page.tsx`
- **Helper signature:**
  ```ts
  export interface RecruitProblemRow {
    problemId: string;
    points: number | null;
  }
  export interface RecruitBestSubmission {
    score: number | null;
  }
  export interface RecruitResultsTotals {
    adjustedByProblem: Map<string, number>;
    totalScore: number;
    totalPossible: number;
  }
  export function computeRecruitResultsTotals(
    assignmentProblemRows: RecruitProblemRow[],
    bestByProblem: Map<string, RecruitBestSubmission>,
  ): RecruitResultsTotals;
  ```
  Internally calls `mapSubmissionPercentageToAssignmentPoints` from
  scoring.ts — keep the existing units-correct math.
- **Test scenarios (5+):**
  1. Empty assignmentProblemRows → totals zero, empty map.
  2. All problems perfect → totalScore == totalPossible.
  3. Mixed scores 80/60/100 on 25-point problems → totalScore=60,
     totalPossible=75 (the cycle-1 C1-AGG-2 regression scenario).
  4. Some problems with no submission → only attempted contribute to
     totalScore.
  5. null score in best submission → does not contribute to total.
  6. Default points (null → 100) handling.
- **Page change:** import the helper, replace the inline reduction
  loop (lines 194-206) with a single call. Keep the bestByProblem
  reduction inline (it's a separate concern and acceptable to keep
  in the page).
- **Status:** [ ] Pending

### TASK-3 [CYC3-AGG-3, LOW]: Add no-DB unit test for `pre-restore-snapshot.ts`

- **File to create:** `tests/unit/db/pre-restore-snapshot.test.ts`
- **Approach:** Use `vi.mock("@/lib/db/export", ...)` to replace
  `streamDatabaseExport` with a tiny in-memory `ReadableStream` (Web
  type, matching the prod return) that emits a few bytes. Use
  `os.tmpdir()` + a unique subdir as DATA_DIR via env-var override
  in beforeEach.
- **Assertions:**
  1. Successful pipeline writes a file with mode 0o600 (verify via
     `stat().mode & 0o777`).
  2. Filename pattern matches `pre-restore-<ISO>-<8-char>.json`.
  3. Multiple invocations + prune keeps the most recent
     `RETAIN_LAST_N=5` (call 7 times, expect 5 files remaining).
  4. Mocked stream-error path triggers `unlink` of the partial file
     (the file should NOT exist after the failed call).
  5. Mocked chmod failure on dir does not abort the snapshot
     (function still returns the path).
- **Cleanup:** afterEach removes the tmpdir.
- **Status:** [ ] Pending

### TASK-4 [CYC3-AGG-4, LOW]: Restructure `validateSqlColumnName` JSDoc to lead with caller-contract

- **File to edit:** `src/lib/assignments/scoring.ts:60-83`
- **Change:** Reorder the JSDoc so the first paragraph is the caller-
  contract, then defence-in-depth statement, then the rejection
  enumeration. Add an explicit note that the blocklist is
  non-exhaustive (covers CYC3-AGG-7):
  ```
  /**
   * SECURITY CONTRACT (PRIMARY): Callers MUST pass only hardcoded
   * string literals or Drizzle column reference names. NEVER pass
   * user-influenced input — this validator is a defence-in-depth
   * backstop, not a primary defence.
   *
   * The validator allows safe identifier patterns (alphanumeric,
   * underscores, dots), SQL function calls (parentheses, commas,
   * spaces), and numeric literals — the patterns used by current
   * callers like `COALESCE(ap.points, 100)` and `s.score`.
   *
   * Defence-in-depth: rejects dangerous characters and a non-exhaustive
   * blocklist of dangerous SQL keywords. The blocklist may not include
   * every dangerous keyword (TRUNCATE, GRANT, REVOKE, MERGE, CALL,
   * LOCK are NOT in the blocklist) — this is intentional, since the
   * primary defence is the caller-contract above. The negative-path
   * test suite in `tests/unit/assignments/scoring.test.ts` pins the
   * current rejection contract.
   *
   * Rejected characters: semicolon, double-hyphen, slash-star,
   *   star-slash, single quote, double quote, backslash.
   * Rejected SQL keywords (case-insensitive, whole-word boundary):
   *   `DELETE`, `DROP`, `INSERT`, `UPDATE`, `ALTER`, `CREATE`, `EXEC`,
   *   `EXECUTE`.
   *
   * Note: identifiers that *contain* a keyword as a substring (e.g.
   * `DROP_test`) are NOT rejected because the underscore is a word
   * character, so `\\bDROP\\b` does not match. This is intentional —
   * identifier substring collisions are acceptable; only standalone
   * keyword payloads are blocked.
   */
  ```
- **Status:** [ ] Pending

### TASK-5 [CYC3-AGG-5, LOW]: Add behavioural test for data-retention failure-isolation

- **File to create:** `tests/unit/data-retention-maintenance.test.ts`
  (or extend existing test file if found).
- **Approach:** Use `vi.mock("@/lib/db", ...)` to replace `db.execute`
  with a function that throws on its second call. The 5
  prune-helpers all go through `batchedDelete` → `db.execute`, so
  one will throw while others succeed. Spy on `logger.warn` to
  assert the rejection-isolation log line is emitted.
- **Assertions:**
  1. `pruneSensitiveOperationalData()` does not throw.
  2. `logger.warn` is called with the expected message
     `"Failed to prune one of the sensitive data tables"`.
  3. The other 4 prune helpers all completed (verify by counting
     successful db.execute calls).
- **Status:** [ ] Pending

### TASK-6 [CYC3-AGG-6, LOW]: Add NaN guard to `mapSubmissionPercentageToAssignmentPoints`

- **File to edit:** `src/lib/assignments/scoring.ts:13-52`
- **Change:** Add `if (!Number.isFinite(score)) return 0;` at the top
  of the function (before `const normalizedPercentage`). Add a unit
  test asserting `mapSubmissionPercentageToAssignmentPoints(NaN, 50)
  === 0`.
- **Status:** [ ] Pending

### TASK-7 [Gates] Run all gates per orchestrator directive

- `npm run lint` — error-blocking
- `npm run lint:bash` — error-blocking
- `npm run test:unit` — error-blocking
- `npm run test:security` — error-blocking
- `npm run build` — error-blocking
- `npm run test:e2e` — best-effort; env-blocked → DEFER-ENV-GATES.

- **Status:** [ ] Pending

---

## DEFERRED items (severity preserved, exit criterion stated)

The following findings are **explicitly deferred this cycle** with
severity preserved and an exit criterion stated. None are HIGH. None
are security/correctness/data-loss-blocking. Deferral rationale is
rooted in repo policy (small, fine-grained commits per global
CLAUDE.md; no force-driven progress where the change surface would
crowd out verification).

| ID | Severity | File+line | Reason for deferral | Exit criterion |
|----|----------|-----------|---------------------|----------------|
| CYC3-AGG-7 | LOW | `src/lib/assignments/scoring.ts:85` blocklist incomplete | Defence-in-depth only; primary defence is caller-contract documented in CYC3-AGG-4 JSDoc restructure | Non-literal caller introduced OR future audit cycle |
| DSGN3-1 | LOW | `recruit/[token]/results/page.tsx:225` 0-problems empty-state copy | UX-only polish; recruiter UI prevents 0-problem assignments at submit time, so the case is rare | Recruiter UI removes the 0-problem-submit guard OR operator reports |
| DSGN3-2 | LOW | `recruit/[token]/results/page.tsx:236-289` per-problem empty-state | Same UX rationale | UX cycle |
| C1-AGG-9 | LOW | `pre-restore-snapshot.ts` prune fire-and-forget | Idempotent prune; no behaviour bug; warn log on failure | Cycle that touches the prune codepath |
| C1-AGG-10 / C1-AGG-11 | LOW | `submission-form.tsx` lastSnapshotRef + unmount | Trigger not met | Submission-form refactor cycle |
| C1-AGG-13 | LOW | AGENTS.md TOC (38KB) | No-touch doc cycle | Writer cycle |
| C1-AGG-14 | LOW | source-grep test brittleness | Long-term refactor | Source-grep replacement cycle |
| C1-AGG-15 | LOW | `pre-restore-snapshot.ts` module location | Touch counter not tripped | ops-tooling consolidation cycle |
| C1-AGG-19 | LOW | submission 4s confirm toast | Trigger not met | Submission-form polish cycle |
| C1-AGG-22 | LOW | aggregate ID index | Long-term | Doc-tooling cycle |
| C3-AGG-5 | LOW | `deploy-docker.sh` whole | Touch counter not tripped this cycle | Modular extraction OR `deploy-docker.sh` >1500 lines |
| C3-AGG-6 | LOW | `deploy-docker.sh:182-191` | Single-tenant deploy host assumption holds | Multi-tenant deploy host |
| C2-AGG-5 (cycle-3 carry) | LOW | 5 polling components | No telemetry signal | Telemetry signal OR 7th instance |
| C2-AGG-6 (cycle-3 carry) | LOW | `practice/page.tsx:417` | Performance trigger not met | p99 > 1.5s OR >5k matching problems |
| C1-AGG-3 (cycle-3 carry) | LOW | client console.error sites | Telemetry/observability cycle not opened | Telemetry cycle opens |
| C5-SR-1 | LOW | `scripts/deploy-worker.sh:101-107` | Trusted source assumption | Untrusted-source APP_URL |
| DEFER-ENV-GATES | LOW | env-blocked tests | Dev-shell limitations | Fully provisioned CI/host |
| D1 (carry) | MEDIUM | JWT clock-skew (NOT `auth/config.ts`) | Auth-perf cycle scope | Auth-perf cycle; **fix outside `src/lib/auth/config.ts`** |
| D2 (carry) | MEDIUM | JWT DB-per-request (NOT `auth/config.ts`) | Auth-perf cycle scope | Auth-perf cycle; **fix outside `src/lib/auth/config.ts`** |
| ARCH-CARRY-1 | MEDIUM | 20 raw of 104 API route handlers | 20-handler refactor too large for one cycle | API-handler refactor cycle |
| ARCH-CARRY-2 | LOW | `realtime-coordination.ts` + SSE route | Trigger not met | SSE perf cycle OR >500 concurrent connections |
| PERF-3 | MEDIUM | anti-cheat heartbeat query | Query rewrite + index work too large for one cycle | Anti-cheat dashboard p99 > 800ms OR >50 concurrent contests |
| C1-AGG-4 (cycle-1 carry) | LOW | `compiler/execute.ts:660` chmod 0o770 | Trigger not met | Security audit OR operator reports |
| C3-AGG-7 (carry) | LOW | `participant-status.ts` `now` time branding | Trigger not met | Type-strictness pass |
| C3-AGG-8 (carry) | LOW | `scoring.ts` mixed-abstraction split | Touching scoring.ts for cycle-3 JSDoc + NaN guard is below the threshold to also justify an architectural split | Next non-trivial scoring-rule change |
| C3-AGG-9 / C1-AGG-17 | LOW | `compiler/execute.ts` size | Slow growth | >1000 lines OR judge-runtime feature touch |
| SEC2-2 | LOW | `pre-restore-snapshot.ts:67-69` | actor-id slice in snapshot filename. Information already in audit log. Defence-in-depth only | Production multi-tenant deploy host or operator report of leak |
| SEC2-3 | LOW | `judge/auth.ts:75-78,95-98` | workerId logged on auth failure. Inline comment confirms intentional choice for incident-response | Operator-reported log spam OR auth-perf cycle |
| C7-AGG-6 (carry) | LOW | `participant-status.ts` time-boundary tests | Trigger not met | Bug report on deadline boundary OR participant-status refactor cycle |
| C7-AGG-7 (carry) | LOW | `encryption.ts:79-81` decrypt plaintext fallback | Migration compatibility; warn-log audit trail in place | Production tampering incident OR audit cycle |
| C7-AGG-9 (carry) | LOW | rate-limit module duplication (now 2 modules; in-memory deleted cycle-1) | One module already removed; no remaining drift trigger | Rate-limit consolidation cycle |
| C1-AGG-24 (subsumed by TASK-3) | LOW | pre-restore-snapshot unit test | -- | TASK-3 lands the test; **deferral closed** when TASK-3 ships |

No HIGH findings deferred. No security/correctness/data-loss
findings deferred unjustifiably. CYC3-AGG-1 (clarity around stat
fallback) is being **scheduled** in TASK-1, not deferred.

---

## Repo policy compliance summary (for the deferred section above)

Per CLAUDE.md / AGENTS.md / ~/.claude/CLAUDE.md:
- All deferred items, when picked up later, must follow the same
  conventional-commit + gitmoji + GPG-signed protocol.
- No `--no-verify` / `--no-gpg-sign` / `eslint-disable` /
  `@ts-ignore` is authorised by the repo rules. None of the
  deferred items would require such a suppression to land.
- The Korean letter-spacing rule in `CLAUDE.md` does not apply to
  any cycle-3 task (no Korean text touched).

---

## Implementation order for PROMPT 3

The 6 active tasks (TASK-1 through TASK-6) are mostly independent.
To minimise commit churn and verification overhead the order will
be:

1. TASK-1 (stat fallback split) — isolated, pre-restore-snapshot.ts.
2. TASK-4 (validateSqlColumnName JSDoc) — independent, scoring.ts
   doc-only.
3. TASK-6 (NaN guard) — same file as TASK-4 (scoring.ts), separate
   commit per fine-grained policy. Includes the unit test.
4. TASK-2 (recruit-results extract) — new helper file + page edit +
   new test file. Largest commit; lands as one feature.
5. TASK-3 (pre-restore-snapshot unit test) — new test file only.
6. TASK-5 (data-retention failure-isolation test) — new test file
   only.
7. TASK-7 (gate run + outcome record).

Each task that mutates code will be followed by a fresh gate run
before the next commit (unit + lint) to confirm no regression.

---

## Status

- [ ] All 6 implementation tasks (commits to follow)
- [ ] All gates green
- [ ] Plan archived to `plans/done/` after close-out
