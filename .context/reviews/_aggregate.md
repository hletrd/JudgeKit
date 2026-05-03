# RPF Loop Cycle 4 — Aggregate Review (2026-05-03)

**Date:** 2026-05-03
**HEAD reviewed:** `7a195b11` (main, post-cycle-3 close-out)
**Prior aggregate:** Cycle 3 (HEAD `dafc0b24`) preserved at
`.context/reviews/_aggregate-prior-cycle-4.md` (snapshot before
overwrite). Live `_aggregate-cycle-4.md` carries the same contents
as this file for archival.

**Reviewers (11 lanes):** code-reviewer, security-reviewer,
perf-reviewer, critic, verifier, test-engineer, tracer, architect,
debugger, document-specialist, designer.

Per-agent files: `.context/reviews/rpf-loop-cycle-4-<agent>.md`.

---

## Cycle-3 → cycle-4 follow-through (carry status)

| Cycle-3 ID | Title | HEAD status | Evidence |
|-----------|-------|-------------|----------|
| CYC3-AGG-1 | stat-failure log split | RESOLVED | `pre-restore-snapshot.ts:99-110` |
| CYC3-AGG-2 | recruit-results extract | RESOLVED | `recruiting-results.ts:53-71`, page:196-197, 8-case test |
| CYC3-AGG-3 | snapshot unit test | RESOLVED | `tests/unit/db/pre-restore-snapshot.test.ts` (5 cases) |
| CYC3-AGG-4 | JSDoc lead-with-contract | RESOLVED | `scoring.ts:66-100` |
| CYC3-AGG-5 | retention isolation test | RESOLVED | `data-retention-maintenance.test.ts:113-150` |
| CYC3-AGG-6 | NaN guard | RESOLVED | `scoring.ts:32-34`, test:57-64 |
| CYC3-AGG-7 | blocklist incomplete | RESOLVED-via-doc | covered by CYC3-AGG-4 JSDoc |
| All other carry-forwards | -- | unchanged, no drift | -- |

All 7 cycle-3 NEW findings closed at HEAD. No regression.

---

## NEW deduplicated findings this cycle

**Severity tally (NEW only):** 0 HIGH, 0 MEDIUM, 4 LOW.

### CYC4-AGG-1: [LOW] Plan housekeeping — stale prior-loop cycle-11 plan still in `plans/open/`

- **Sources:** code-reviewer (CR4-4), critic (CRIT4-1) — **2-lane
  convergence**
- **File:** `plans/open/2026-04-29-rpf-cycle-11-review-remediation.md`
- **Description:** This file is from a prior RPF loop (loop cycle 11/100,
  HEAD `7073809b` which is no longer reachable from `main`). The current
  loop is processing cycle 4. Leaving the file in `plans/open/` confuses
  any reader who scans the directory expecting current work.
- **Confidence:** MEDIUM
- **Failure scenario:** A future reviewer reads `plans/open/`, sees the
  cycle-11 plan body marked "IN PROGRESS", and either tries to act on
  stale tasks or wastes time reconciling with the current loop's plans.
- **Fix:** Move
  `plans/open/2026-04-29-rpf-cycle-11-review-remediation.md` to
  `plans/closed/` and prepend a header noting "superseded by current
  RPF loop cycles 1-4 (HEAD `7a195b11`)". Cheap housekeeping, eliminates
  reader confusion.

### CYC4-AGG-2: [LOW] `recruiting-results.ts` interface-member JSDoc gap + Map widening contract

- **Sources:** code-reviewer (CR4-1), critic (CRIT4-2),
  document-specialist (DS4-2), verifier (V4-2) — **4-lane convergence**
- **File:** `src/lib/assignments/recruiting-results.ts:17-24`
- **Description:** `RecruitProblemRow` and `RecruitBestSubmission` lack
  field-level JSDoc. The page passes a wider Map type
  (`Map<string, (typeof submissionRows)[number]>`) which structurally
  fits the helper's narrower input. If the helper grows to read a new
  field, the page's wider Map silently provides it OR silently provides
  `undefined`. Today this is correct (helper reads only `score`), but the
  contract is implicit.
- **Confidence:** MEDIUM (4-lane signal; defensive nicety)
- **Failure scenario:** Future change adds `attemptCount: number` to
  `RecruitBestSubmission`; helper logic uses it. Page does not project
  the field into its Map → helper sees `undefined`.
- **Fix:** Add field-level JSDoc to both interfaces. Add a function-level
  JSDoc note: "Callers may pass any Map whose values include a
  `score: number | null` field; other fields are ignored. If a future
  helper grows to read more fields, callers MUST narrow accordingly."

### CYC4-AGG-3: [LOW] `data-retention-maintenance.ts` legal-hold short-circuit not exercised by test

- **Sources:** architect (ARCH4-1) — **1-lane**
- **File:** `src/lib/data-retention-maintenance.ts:107-110`
- **Description:** `if (DATA_RETENTION_LEGAL_HOLD)` returns early without
  pruning. The cycle-3 failure-isolation test does not cover this branch.
  Operationally, the legal-hold flag is the operator's escape hatch for
  litigation holds; a regression that drops it is high-impact.
- **Confidence:** LOW (test gap, no behaviour bug today)
- **Failure scenario:** Refactor accidentally moves the legal-hold check
  inside the try-block where a thrown DB error before reaching the check
  still emits warn logs. Today's behaviour: legal-hold check is the first
  statement, before any DB call.
- **Fix:** Add a unit test that imports the function with
  `DATA_RETENTION_LEGAL_HOLD = true` and asserts `db.execute` is never
  called.

### CYC4-AGG-4: [LOW] `pre-restore-snapshot.test.ts` mtime-resolution assumption undocumented

- **Sources:** code-reviewer (CR4-2), perf-reviewer (PERF4-1),
  critic (Q3) — **3-lane convergence**
- **File:** `tests/unit/db/pre-restore-snapshot.test.ts:108-133`
- **Description:** The retention test inserts a 5ms `setTimeout` between
  snapshots so that the prune sort order is deterministic. On a slow CI
  runner with second-resolution mtime (older NFS, FAT, some Docker
  volumes), two snapshots could share the same mtime second, causing the
  prune sort to break ties unpredictably. macOS APFS / Linux ext4 / btrfs
  / zfs are sub-second; CI containers vary.
- **Confidence:** LOW (no current trigger; CI/dev shells satisfy
  sub-second mtime)
- **Failure scenario:** Test flakes on a future CI runner with
  second-resolution mtime, intermittently keeping 4 or 6 files instead of 5.
- **Fix:** Add an inline comment near the `setTimeout(r, 5)` documenting
  the sub-second-mtime assumption.

---

## Path drift / count drift corrections this cycle

| Carry-forward ID | Prior count/path | Updated at HEAD `7a195b11` |
|---|---|---|
| (no carry-forward path drift this cycle) | -- | -- |

The cycle-3 close-out only added/edited the 7 files audited above. No
file paths in the carry-forward registry changed.

---

## Carry-forward DEFERRED items (status verified at HEAD `7a195b11`)

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
| D2 | MEDIUM | JWT DB-per-request (NOT `auth/config.ts`) | DEFERRED | Auth-perf cycle |
| ARCH-CARRY-1 | MEDIUM | 20 raw of 104 API route handlers | DEFERRED | API-handler refactor cycle |
| ARCH-CARRY-2 | LOW | `realtime-coordination.ts` + SSE route | DEFERRED | SSE perf cycle OR >500 concurrent |
| PERF-3 | MEDIUM | Anti-cheat heartbeat query | DEFERRED | Anti-cheat p99 > 800ms OR >50 contests |
| C7-AGG-6 | LOW | `participant-status.ts` time-boundary tests | DEFERRED | Bug report on deadline boundary |
| C7-AGG-7 | LOW | `encryption.ts:79-81` decrypt plaintext fallback | DEFERRED-with-doc-mitigation | Production tampering OR audit cycle |
| C7-AGG-9 | LOW | rate-limit module duplication | DEFERRED-with-doc-mitigation | Rate-limit consolidation cycle |
| C1-AGG-4 | LOW | `compiler/execute.ts:660` chmod 0o770 | DEFERRED | Security audit OR operator reports |
| C3-AGG-7 (carry) | LOW | `participant-status.ts` `now` time branding | DEFERRED | Type-strictness pass |
| C3-AGG-8 (carry) | LOW | `scoring.ts` mixed-abstraction split | DEFERRED | Next non-trivial scoring-rule change |
| C3-AGG-9 / C1-AGG-17 | LOW | `compiler/execute.ts` size | DEFERRED | >1000 lines OR judge-runtime feature |
| C1-AGG-9 | LOW | snapshot prune fire-and-forget | DEFERRED | Cycle that touches the prune codepath |
| C1-AGG-10 / C1-AGG-11 | LOW | `submission-form.tsx` lastSnapshotRef + unmount | DEFERRED | Submission-form refactor cycle |
| C1-AGG-13 | LOW | AGENTS.md TOC | DEFERRED | Writer cycle |
| C1-AGG-14 | LOW | source-grep test brittleness | DEFERRED | Source-grep replacement cycle |
| C1-AGG-15 | LOW | `pre-restore-snapshot.ts` module location | DEFERRED | Ops-tooling consolidation cycle |
| C1-AGG-19 | LOW | submission 4s confirm toast | DEFERRED | Submission-form polish cycle |
| C1-AGG-22 | LOW | aggregate ID index | DEFERRED | Doc-tooling cycle |
| SEC2-2 | LOW | snapshot filename actor-id slice | DEFERRED | Multi-tenant deploy or leak report |
| SEC2-3 | LOW | judge auth log workerId | DEFERRED | Operator log spam OR auth-perf cycle |
| DSGN3-1 | LOW | recruit-results 0-problems empty-state | DEFERRED | Recruiter UI prevents 0-problem-submit OR operator reports |
| DSGN3-2 | LOW | recruit-results per-problem empty-state | DEFERRED | UX-cycle |
| CYC3-AGG-7 (carried doc-mitigation) | LOW | scoring.ts blocklist | DEFERRED-with-doc-mitigation | Non-literal caller introduced |

No HIGH findings deferred. No security/correctness/data-loss
findings deferred unjustifiably.

---

## Cross-agent agreement summary

- **CYC4-AGG-2 (recruit-results JSDoc + Map widening)**: 4-lane (CR + CRIT
  + DS + VER). Highest signal LOW.
- **CYC4-AGG-1 (stale plan in `plans/open/`)**: 2-lane (CR + CRIT).
- **CYC4-AGG-4 (mtime-resolution assumption)**: 3-lane (CR + PERF + CRIT).
- **CYC4-AGG-3 (legal-hold test gap)**: 1-lane (ARCH).

No new HIGH findings. No new MEDIUM findings. All 4 NEW findings are LOW.
The cycle-3 close-out's 7 fixes are all verified at HEAD with strong test
coverage; the cycle-4 review surface is correspondingly quiet.

---

## Agent failures

None this cycle. All 11 reviewer perspectives produced artifacts in
`.context/reviews/rpf-loop-cycle-4-<agent>.md`. Designer was a source-only
review — runtime UI/UX review remains env-blocked under DEFER-ENV-GATES.

---

## Suggested PROMPT 3 priority order

1. **CYC4-AGG-1 (stale plan archive)** — 2-lane, easy housekeeping,
   immediate clarity benefit.
2. **CYC4-AGG-2 (recruit-results JSDoc + Map widening contract)** —
   4-lane, doc-only, no behaviour change.
3. **CYC4-AGG-3 (legal-hold test)** — 1-lane, defensive coverage of a
   high-impact branch (litigation hold).
4. **CYC4-AGG-4 (mtime-resolution comment)** — 3-lane, doc-only inline
   comment.
