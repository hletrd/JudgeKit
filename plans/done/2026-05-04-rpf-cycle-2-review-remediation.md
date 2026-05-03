# RPF Loop Cycle 2 — Review Remediation Plan (2026-05-04)

**HEAD at planning time:** `ef102367` (main, post-cycle-1 close-out)
**Source aggregate:** `.context/reviews/_aggregate.md` (cycle 2)
**User-injected TODOs:** ingested from `./user-injected/pending-next-cycle.md` and `./plans/user-injected/`. The pending file lists **(none at the moment)** for active items; the workspace-to-public migration TODO is "substantially complete" with no per-cycle action required. Nothing new to ingest this cycle.

## Repo policy compliance (read at planning time)

- `CLAUDE.md` (project): preserve `src/lib/auth/config.ts` as-is on deploy; deploy-mode this cycle is `none`, no concern. Korean letter-spacing rule: do not apply `tracking-*` to Korean text — none of the cycle-2 fixes touch Korean text.
- `~/.claude/CLAUDE.md` (global): GPG-sign every commit, conventional-commit + gitmoji, fine-grained commits, pull --rebase before push, no Co-Authored-By, latest-stable language/framework versions.
- `AGENTS.md`: documentation-source-of-truth for the 125 language list; no language config changes this cycle.

## Done criteria (cycle-level)

- C2-AGG-1, C2-AGG-2, C2-AGG-3, C2-AGG-4, C2-AGG-6, C2-AGG-7, C2-AGG-8, C2-AGG-9 implemented.
- C2-AGG-5 (recruit-results monolith) is **deferred** to a dedicated refactor cycle — see deferred section below; the test gap it covers is partially addressed by C2-AGG-1's scoring-helper tests landing in `scoring.test.ts`.
- All gates green: `npm run lint`, `npm run lint:bash`, `npx tsc --noEmit`, `npm run test:unit`, `npm run test:security`, `npm run build`.
- E2E gate attempted; if env-blocked recorded as DEFER-ENV-GATES.

---

## TASKS

### TASK-1 [C2-AGG-1, LOW]: Add negative-path tests for `validateSqlColumnName`

- **File to edit:** `tests/unit/assignments/scoring.test.ts`
- **Behaviour to assert:**
  - 6+ negative cases: `";DROP TABLE users"`, `"score' OR 1=1"`, `"score--inj"`, `"col/*x*/y"`, `"a\\b"`, `"DROP_test"`, `"col DELETE"`, `"col INSERT"`, `"col EXEC"`. All must cause `buildIoiLatePenaltyCaseExpr(<bad>, ...)` to **throw**.
  - 3 positive cases: `"score"`, `"s.score"`, `"COALESCE(ap.points, 100)"`. Must return a non-empty SQL string.
- **Status:** [x] Done

### TASK-2 [C2-AGG-2, LOW (data-loss-adjacent)]: Unlink partial pre-restore-snapshot file on pipeline failure

- **File to edit:** `src/lib/db/pre-restore-snapshot.ts`
- **Change:** In the outer `catch` block (currently lines 109-112), call `await unlink(fullPath).catch(() => {})` before `return null`. Add a comment explaining the unlink prevents future restore-time confusion if a later operator picks up a partial snapshot.
- **Status:** [x] Done

### TASK-3 [C2-AGG-3, LOW]: Replace byte-counter wrapper with `stat()` after pipeline

- **File to edit:** `src/lib/db/pre-restore-snapshot.ts`
- **Change:** Drop the `NodeReadableStream` byte-counter (lines 71-96). Replace with:
  ```ts
  await pipeline(
    Readable.fromWeb(streamDatabaseExport({ sanitize: false })),
    createWriteStream(fullPath, { mode: 0o600 }),
  );
  const sizeBytes = (await stat(fullPath)).size;
  ```
  Keep the `logger.info` call. Verify imports: `stat` is already imported from `node:fs/promises`.
- **Note:** The cycle-1 inline JSDoc at lines 41-44 mentions the byte-counter wrapper; update the comment to describe the simpler approach.
- **Status:** [x] Done

### TASK-4 [C2-AGG-6, LOW]: Enumerate rejection patterns in `validateSqlColumnName` JSDoc

- **File to edit:** `src/lib/assignments/scoring.ts`
- **Change:** Append to the JSDoc immediately above `validateSqlColumnName`:
  ```
  Rejected characters: ; -- /* */ ' " \
  Rejected SQL keywords (case-insensitive): DELETE, DROP, INSERT,
    UPDATE, ALTER, CREATE, EXEC, EXECUTE
  ```
- **Status:** [x] Done

### TASK-5 [C2-AGG-8, LOW]: Document `pruneSensitiveOperationalData` failure-isolation in JSDoc

- **File to edit:** `src/lib/data-retention-maintenance.ts`
- **Change:** Add a function-level JSDoc to `pruneSensitiveOperationalData` (or extend the existing comment block at lines 86-100 into a `/** ... */` JSDoc) that includes a `@remarks` block describing the `Promise.allSettled` failure-isolation contract.
- **Status:** [x] Done

### TASK-6 [C2-AGG-7, LOW]: Document pre-restore snapshot artefact in SECURITY.md

- **File to edit:** `SECURITY.md`
- **Change:** Add a short paragraph (2-4 sentences) under an appropriate section (e.g., the same place that discusses operator/audit data) describing:
  - Path: `${DATA_DIR:-./data}/pre-restore-snapshots/`
  - Mode: directory `0o700` (best-effort), file `0o600`
  - Retention: last 5 snapshots (`RETAIN_LAST_N`)
  - Contents: full-fidelity DB export including hashed credentials and encrypted column ciphertexts (this is intentionally non-portable; not for offsite archival)
- **Status:** [x] Done

### TASK-7 [C2-AGG-4, LOW (perf)]: Parallelize the two recruit-results SELECTs

- **File to edit:** `src/app/(auth)/recruit/[token]/results/page.tsx`
- **Change:** Wrap `assignmentProblemRows` and `submissionRows` in a single `Promise.all([...])` (currently lines 137-167). The destructuring tuple is straightforward — both queries depend only on `assignment.id` and `invitation.userId` (already in scope by the time of the calls).
- **Status:** [x] Done

### TASK-8 [C2-AGG-9, LOW (UX)]: Empty-state for "no problems" recruit results

- **File to edit:** `src/app/(auth)/recruit/[token]/results/page.tsx`
- **Change:** Wrap the score card render `{showScores && <div className="rounded-lg ...">...</div>}` in `{showScores && totalPossible > 0 && <div ...>}`. The per-problem list already renders an empty UL when `assignmentProblemRows` is empty — that is acceptable. The change is the score card guard only.
- **Status:** [x] Done

### TASK-9 [Gates] Run all gates per orchestrator directive

- `npm run lint` — error-blocking
- `npm run lint:bash` — error-blocking
- `npx tsc --noEmit` — error-blocking
- `npm run test:unit` — error-blocking
- `npm run test:security` — error-blocking
- `npm run build` — error-blocking
- `npm run test:e2e` — best-effort; env-blocked → DEFER-ENV-GATES.

- **Status:** [x] Done

---

## DEFERRED items (severity preserved, exit criterion stated)

The following findings are **explicitly deferred this cycle** with severity preserved and an exit criterion stated. None are HIGH. None are security/correctness/data-loss-blocking. Deferral rationale is rooted in repo policy (small, fine-grained commits per global CLAUDE.md; no force-driven progress where the change surface would crowd out verification).

| ID | Severity | File+line | Reason for deferral | Exit criterion |
|----|----------|-----------|---------------------|----------------|
| C2-AGG-5 | LOW | `src/app/(auth)/recruit/[token]/results/page.tsx` (whole) | Recruit-results monolith. Extracting to a pure helper requires changing both the page AND adding a test, and the parallel-SELECT fix in TASK-7 already touches the same file. Lumping a structural extraction with a perf fix would crowd out clean verification. | Schedule when a future bug or feature touches the recruit-results scoring math. Defer to a dedicated refactor cycle. |
| TE2-2 (overlap with C2-AGG-5) | LOW | `tests/unit/recruit-results-scoring.test.ts` (new file) | Cannot meaningfully unit-test the math while the math lives inline in a server component. Will land alongside the C2-AGG-5 extraction. | Same as above. |
| TE2-5 / DBG2-2 | LOW | `src/lib/data-retention-maintenance.ts` regression test | Requires either a Postgres fixture (env-blocked DEFER-ENV-GATES) or a wholesale mock of `db.execute`. Out-of-scope without environment work. | Fully provisioned CI/host (DEFER-ENV-GATES exit criterion). |
| SEC2-2 | LOW | `src/lib/db/pre-restore-snapshot.ts:67-69` | actor-id slice in snapshot filename. Information already in audit log. Defence-in-depth only. | Production multi-tenant deploy host or operator report of leak. |
| SEC2-3 | LOW | `src/lib/judge/auth.ts:75-78,95-98` | workerId logged on auth failure. Inline comment confirms intentional choice for incident-response. | Operator-reported log spam OR auth-perf cycle. |
| C7-AGG-6 (carry) | LOW | `src/lib/assignments/participant-status.ts` time-boundary tests | Trigger not met. | Bug report on deadline boundary OR participant-status refactor cycle. |
| C7-AGG-7 (carry) | LOW | `src/lib/security/encryption.ts:79-81` decrypt plaintext fallback | Migration compatibility; warn-log audit trail in place. | Production tampering incident OR audit cycle. |
| C7-AGG-9 (carry) | LOW | rate-limit module duplication (now 2 modules; in-memory deleted cycle-1) | One module already removed; no remaining drift trigger. | Rate-limit consolidation cycle. |
| C3-AGG-5 (carry) | LOW | `deploy-docker.sh` size | Touch counter not tripped this cycle. | Modular extraction OR `deploy-docker.sh` >1500 lines. |
| C3-AGG-6 (carry) | LOW | `deploy-docker.sh:182-191` | Single-tenant deploy host assumption holds. | Multi-tenant deploy host. |
| C2-AGG-5 (cycle-3 carry) | LOW | 5 polling components | No telemetry signal. | Telemetry signal OR 7th instance. |
| C2-AGG-6 (cycle-3 carry) | LOW | `practice/page.tsx:417` | Performance trigger not met. | p99 > 1.5s OR >5k matching problems. |
| C1-AGG-3 (cycle-3 carry) | LOW | client console.error sites | Telemetry/observability cycle not opened. | Telemetry cycle opens. |
| C5-SR-1 (carry) | LOW | `scripts/deploy-worker.sh:101-107` | Trusted source assumption. | Untrusted-source APP_URL. |
| DEFER-ENV-GATES | LOW | env-blocked tests | Dev-shell limitations. | Fully provisioned CI/host. |
| D1 (carry) | MEDIUM | `src/lib/auth/...` JWT clock-skew (NOT `config.ts`) | Auth-perf cycle scope. | Auth-perf cycle; **fix outside `src/lib/auth/config.ts`**. |
| D2 (carry) | MEDIUM | `src/lib/auth/...` JWT DB-per-request (NOT `config.ts`) | Auth-perf cycle scope. | Auth-perf cycle; **fix outside `src/lib/auth/config.ts`**. |
| ARCH-CARRY-1 | MEDIUM | 20 raw of 104 API route handlers | 20-handler refactor too large for one cycle. | API-handler refactor cycle. |
| ARCH-CARRY-2 | LOW | `realtime-coordination.ts` + SSE route | Trigger not met. | SSE perf cycle OR >500 concurrent connections. |
| PERF-3 | MEDIUM | `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` | Query rewrite + index work too large for one cycle. | Anti-cheat dashboard p99 > 800ms OR >50 concurrent contests. |
| C1-AGG-4 (cycle-1 carry) | LOW | `compiler/execute.ts:660` chmod 0o770 | Trigger not met. | Security audit OR operator reports. |
| C3-AGG-7 (carry) | LOW | `participant-status.ts` `now` time branding | Trigger not met. | Type-strictness pass. |
| C3-AGG-8 (carry) | LOW | `scoring.ts` mixed-abstraction split | Touching scoring.ts for the JSDoc enum (TASK-4) is below the threshold to also justify an architectural split. | Next non-trivial scoring-rule change. |
| C3-AGG-9 / C1-AGG-17 | LOW | `compiler/execute.ts` size (855 lines) | Slow growth. | >1000 lines OR judge-runtime feature touch. |
| C1-AGG-9 (cycle-1 carry) | LOW | `pre-restore-snapshot.ts` prune fire-and-forget | Idempotent prune; no behaviour bug. | Cycle that touches the prune codepath. |
| C1-AGG-10 / C1-AGG-11 | LOW | `submission-form.tsx` lastSnapshotRef + unmount | Trigger not met. | Submission-form refactor cycle. |
| C1-AGG-13 (carry) | LOW | AGENTS.md TOC (38KB) | No-touch doc cycle. | Writer cycle. |
| C1-AGG-14 (carry) | LOW | source-grep test brittleness | Long-term refactor. | Source-grep replacement cycle. |
| C1-AGG-15 (carry) | LOW | pre-restore-snapshot.ts module location | Touch counter not tripped. | ops-tooling consolidation cycle. |
| C1-AGG-19 (carry) | LOW | submission 4s confirm toast | Trigger not met. | Submission-form polish cycle. |
| C1-AGG-22 (carry) | LOW | aggregate ID index | Long-term. | Doc-tooling cycle. |
| C1-AGG-24 (carry) | LOW | pre-restore-snapshot unit test | Env-blocked. | DEFER-ENV-GATES exit. |

No HIGH findings deferred. No security/correctness/data-loss findings deferred unjustifiably. The DBG2-1 / C2-AGG-2 finding is data-loss-adjacent and is **scheduled** in TASK-2.

---

## Repo policy compliance summary (for the deferred section above)

Per CLAUDE.md / AGENTS.md / ~/.claude/CLAUDE.md:
- All deferred items, when picked up later, must follow the same conventional-commit + gitmoji + GPG-signed protocol.
- No `--no-verify` / `--no-gpg-sign` / `eslint-disable` / `@ts-ignore` is authorised by the repo rules. None of the deferred items would require such a suppression to land.

---

## Implementation order for PROMPT 3

The 8 active tasks (TASK-1 through TASK-8) are independent. To minimise commit churn and verification overhead the order will be:

1. TASK-2 (snapshot partial-write unlink) — data-loss-adjacent, isolated.
2. TASK-3 (byte-counter simplification) — same file as TASK-2; bundle to one commit if both fix sites touch the same JSDoc block, otherwise two separate commits per fine-grained policy.
3. TASK-1 (validateSqlColumnName negative-path tests) — test-only.
4. TASK-4 (validateSqlColumnName JSDoc enumeration) — same file as TASK-1's source target; separate commit per fine-grained policy.
5. TASK-5 (data-retention JSDoc remarks) — independent.
6. TASK-6 (SECURITY.md mention) — independent.
7. TASK-7 (recruit-results parallel SELECTs) — recruit page, no overlap with TASK-8 (different region).
8. TASK-8 (recruit-results empty-state guard) — recruit page.
9. TASK-9 (gate run + outcome record).

Each task that mutates code will be followed by a fresh gate run before the next commit (unit + lint + typecheck) to confirm no regression.

---

## Status

- [x] All 8 implementation tasks (commits below)
- [x] All gates green
- [x] Plan archived to `plans/done/` after close-out

## Cycle close-out evidence

- Commits landed this cycle (against pre-cycle HEAD `ef102367`):
  - `34a4e0fe` fix(restore): unlink partial snapshot + drop byte-counter wrapper (TASK-2 + TASK-3)
  - `46c1fa58` test(scoring): pin validateSqlColumnName rejection contract (TASK-1)
  - `3ec5734a` docs(scoring): enumerate validateSqlColumnName rejection patterns (TASK-4)
  - `d5565c65` docs(retention): document failure-isolation contract for daily prune (TASK-5)
  - `74e41029` docs(security): document pre-restore snapshot artefact (TASK-6)
  - `313d9708` perf(recruit): run candidate-results SELECTs in parallel (TASK-7)
  - `10c78d81` fix(recruit): hide score card when assignment has 0 problems (TASK-8)
  - `7823607e` docs(plans): add RPF loop cycle 2 review aggregate + remediation plan
- Gate run at HEAD post-cycle:
  - `npm run lint` — exit 0
  - `npm run lint:bash` — exit 0
  - `npx tsc --noEmit` — exit 0
  - `npm run test:unit` — 305 files / **2241 tests passed** (+10 new)
  - `npm run test:security` — 11 files / 195 tests passed
  - `npm run build` — exit 0 (next build succeeded)
  - `npm run test:e2e` — env-blocked, deferred under DEFER-ENV-GATES
- Deploy: `none` per orchestrator directive (DEPLOY_MODE=none).
