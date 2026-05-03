# RPF Loop Cycle 1 — Review Remediation Plan (2026-05-03)

**HEAD at planning time:** `37a4a8c3` (main)
**Source aggregate:** `.context/reviews/_aggregate.md` (this cycle)
**User-injected TODOs:** ingested from `./user-injected/pending-next-cycle.md` and `./plans/user-injected/pending-next-cycle.md` — both currently empty (`(none at the moment)` / TODO #1 marked DONE 2026-04-29). Nothing new to ingest this cycle.

## Repo policy compliance (read at planning time)

- `CLAUDE.md` — preserve `src/lib/auth/config.ts` as-is on deploy; deploy-mode this cycle is `none`, no concern.
- `CLAUDE.md` — Korean letter-spacing rule: do NOT apply `tracking-*` to Korean text. C1-AGG-12 captures the meta-issue; per-fix changes must preserve this.
- `~/.claude/CLAUDE.md` — Always GPG-sign commits, conventional-commit + gitmoji, fine-grained commits, pull --rebase before push, no Co-Authored-By.
- Latest stable: Node 24 LTS, Next.js 16, React 19, TypeScript ESNext — already pinned in `package.json`.

## Done criteria (cycle-level)

- All 28 unit-test failures resolved (or test removed because the source-level invariant moved/no longer applies, with a quoted reason in the commit body).
- `npm run lint`, `npm run lint:bash`, `npx tsc --noEmit`, `npm run test:unit`, `npm run test:security`, `npm run build` all green.
- `npm run test:e2e` attempted; if environment-blocked, deferred with quoted reason.
- C1-AGG-2 (recruit-results scoring) fixed and a regression test added.
- C1-AGG-3..C1-AGG-7 (5 MEDIUMs) fixed.
- LOW items: scheduled by ID below; any deferred items recorded with severity preserved and exit criterion stated.

---

## TASKS — HIGH

### TASK-1: Triage and fix all 28 unit-test failures (C1-AGG-1)

Per failure list (captured `/tmp/judgekit-fails.txt` and `_aggregate.md`):

#### TASK-1.1: `tests/unit/users/core.test.ts` — `validateAndHashPassword` 2-arg → 1-arg
- Source: `src/lib/users/core.ts:55-63` (1-arg)
- Test: lines 200, 220-221.
- Fix: drop second arg from call at line 200 and 220; assert `getPasswordValidationError` was called with `("Password1!")` only (no ctx).
- Status: PENDING

#### TASK-1.2: `tests/unit/actions/change-password.test.ts` — same context-arg drift
- Source: `src/lib/actions/change-password.ts:60` (1-arg).
- Test: lines 237-249.
- Fix: drop the 2nd-arg expectation; assert single-arg call.
- Status: PENDING

#### TASK-1.3: `tests/unit/judge/auth.test.ts` — "falls back to shared token" (line 154-162)
- Source: `src/lib/judge/auth.ts:70-80` deliberately rejects unknown workers (commit `909fcbf5`).
- Fix: invert the assertion to `{ authorized: false, error: "workerNotFound" }`. Rename test to "rejects requests for unknown workerIds even with a valid shared token".
- Status: PENDING
- **Security note:** This test guards against the previous footgun. Must NOT be re-enabled.

#### TASK-1.4: `tests/unit/validators/groups.test.ts` — `bulkEnrollmentSchema` 200 → 500
- Source: `src/lib/validators/groups.ts:29-30` allows up to 500.
- Fix: update boundary tests to 500/501.
- Status: PENDING

#### TASK-1.5: `tests/unit/capabilities/defaults.test.ts` and `tests/unit/capabilities/cache.test.ts` — assistant capability bag
- Source: `src/lib/capabilities/defaults.ts:15-34` excludes `submissions.view_all` deliberately.
- Fix: read each test, identify the asserted capability set, align to current source.
- Status: PENDING

#### TASK-1.6: `tests/unit/judge/ip-allowlist.test.ts` — IPv6 CIDR no longer "doesn't match"
- Source: `src/lib/judge/ip-allowlist.ts:128-133` adds IPv6 CIDR support.
- Fix: invert the assertion; add positive cases for `::1/128`, `2001:db8::/32`.
- Status: PENDING

#### TASK-1.7: `tests/unit/api/group-members-bulk.route.test.ts` — 2 failures
- Source: `src/app/api/v1/groups/[id]/members/bulk/route.ts` accepts `usernames` and returns `unresolvedUsernames`/`nonStudentUsernames`.
- Fix: update mocks/expectations to include the new response shape and 0-or-1 of the new fields.
- Status: PENDING

#### TASK-1.8: `tests/unit/hooks/use-source-draft.test.ts` — 3 hydration failures
- Root cause not yet identified. Hypothesis: React 19 effect timing or memoization regression.
- Fix: read each failure, repro with `--reporter=verbose`, identify root cause; either fix the hook or stabilize the test setup.
- Status: PENDING (low priority within HIGH triage, since it's source-grep / hook timing)

#### TASK-1.9: `tests/unit/infra/deploy-security.test.ts` — 3 failures
- Likely: docker-compose or deploy-docker.sh literals drifted.
- Fix: identify the diverged literal, align the test to current compose/deploy.
- Status: PENDING

#### TASK-1.10: 12 source-grep `*-implementation.test.ts` failures
- Fix per file: read assertion, find new literal in source, update.
- List:
  - `tests/unit/custom-role-pages-implementation.test.ts`
  - `tests/unit/ui-i18n-keys-implementation.test.ts`
  - `tests/unit/mobile-ui-layout-implementation.test.ts` (md → lg)
  - `tests/unit/problem-page-anti-cheat-implementation.test.ts`
  - `tests/unit/api/recruiting-candidate-isolation-implementation.test.ts` (×2 — manually verify isolation still holds)
  - `tests/unit/assignment-context-requirement-implementation.test.ts`
  - `tests/unit/ui-hardcoded-strings-implementation.test.ts`
  - `tests/unit/lecture-stats-wiring-implementation.test.ts`
  - `tests/unit/problem-page-scroll-layout-implementation.test.ts`
  - `tests/unit/infra/source-grep-inventory.test.ts`
  - `tests/unit/personal-submissions-page-implementation.test.ts`
  - `tests/unit/problem-rankings-page.test.ts`
- Status: PENDING

### TASK-2: Fix `recruit/[token]/results/page.tsx` total-score arithmetic (C1-AGG-2)

- File: `src/app/(auth)/recruit/[token]/results/page.tsx:183-263`
- Fix: Convert each best.score (percentage) → adjusted points via `mapSubmissionPercentageToAssignmentPoints(best.score, ap.points)`. Use the resulting per-problem adjusted points in both the per-problem display row (line 263) and the total accumulator (lines 183-191).
- Test: add a regression unit test that constructs a synthetic recruit result fixture (e.g., 3 problems × 25 points each, candidate scores [80, 60, 100] percent → expected total = 60).
- Status: PENDING

---

## TASKS — MEDIUM

### TASK-3: Harden `pre-restore-snapshot.ts` (C1-AGG-3 + C1-AGG-4)

- File: `src/lib/db/pre-restore-snapshot.ts`
- Fix:
  1. Set directory mode after mkdir: `await chmod(dir, 0o700).catch(() => {})` (best-effort).
  2. Stream the export directly to disk via `pipeline(Readable.fromWeb(stream), createWriteStream(fullPath, { mode: 0o600 }))` from `node:stream/promises` and `node:fs`.
  3. Drop the in-memory chunks array.
- Status: PENDING

### TASK-4: Fix `judge/auth.ts` warn-log `%s` placeholder (C1-AGG-5)

- File: `src/lib/judge/auth.ts:92-95`
- Fix: change message to `"[judge] Worker has no secretTokenHash — rejecting auth. Re-register the worker so it acquires a per-worker secret."` (drop `%s`). `workerId` is already on the binding object; pino structured logging keeps it discoverable.
- Status: PENDING

### TASK-5: Contain `docker/client.ts` config-error message (C1-AGG-6)

- File: `src/lib/docker/client.ts:26-30, 101-103, 292-415`
- Fix: rename `WORKER_DOCKER_API_CONFIG_ERROR` to a private constant with the operator-friendly message; in each public function, log via `logger.error` and return `{ success: false, error: "configError" }` (or throw `Error("configError")` for the throw paths). The admin UI currently displays the error string directly — update its locale strings if needed (`messages/en.json`/`ko.json`).
- Status: PENDING

### TASK-6: Parallelize `data-retention-maintenance.ts` prune jobs (C1-AGG-7)

- File: `src/lib/data-retention-maintenance.ts:96-105`
- Fix: replace the 5 sequential awaits with a single `await Promise.all([…])`.
- Status: PENDING

---

## TASKS — LOW (carry-forward, prioritized)

| Task | ID | Priority within LOW |
|------|----|---------------------|
| TASK-7  | C1-AGG-8  comment on accepted→submitted fall-through in participant-status.ts | A |
| TASK-8  | C1-AGG-9  await pruneOldSnapshots in pre-restore-snapshot OR document fire-and-forget | A |
| TASK-9  | C1-AGG-10 reset `lastSnapshotRef` in submission-form on successful submit | A |
| TASK-10 | C1-AGG-21 update SECURITY.md to mention pre-restore snapshot artefact | A |
| TASK-11 | C1-AGG-23 document RETAIN_LAST_N=5 rationale in pre-restore-snapshot.ts | A |
| TASK-12 | C1-AGG-24 add unit test for pre-restore-snapshot.ts (cover prune + naming) | B |
| TASK-13 | C1-AGG-25 (becomes part of TASK-2 regression test) | A — bundled with TASK-2 |
| TASK-14 | C1-AGG-22 add `_findings-index.md` mapping aggregate IDs to status | C |

---

## DEFERRED — explicitly recorded (not silently dropped)

These cycle-3 carryovers and cycle-1 LOWs are deferred this cycle. Each preserves its severity; none is security/correctness/data-loss.

### DEFER-1: Cycle-3 C3-AGG-5 — `submissions/visibility.ts` N+1
- **Severity:** LOW
- **Reason:** Hot-path callers already pass `assignmentVisibility`; the JSDoc warns. A perf-warning log is the proposed mitigation but not in scope this cycle (tests broken; HIGH items take precedence).
- **Exit criterion:** A reproducible N+1 trace from production OR a separate cycle dedicated to N+1 audit.
- **Repo-rule basis:** Standard task-prioritization within the RPF loop; LOW items are deferable when HIGH items dominate the cycle.

### DEFER-2: Cycle-3 C3-AGG-6 — `compiler/execute.ts` pLimit unbounded queue
- **Severity:** LOW (memory pressure on sustained burst; not a correctness issue)
- **Reason:** Already deferred in cycle 3; same conditions hold. No new evidence of memory pressure in production.
- **Exit criterion:** Production memory-pressure signal OR sandbox/load-test reproducer.

### DEFER-3: Cycle-3 C3-AGG-7 — `now` parameter type branding
- **Severity:** LOW (style/safety, not correctness)
- **Reason:** Type branding requires touching every caller; not justified by current bug density.
- **Exit criterion:** A confirmed bug caused by client-time vs. db-time confusion.

### DEFER-4: Cycle-3 C3-AGG-8 — `scoring.ts` SQL extraction
- **Severity:** LOW (style)
- **Reason:** Module remains compact (134 lines); split would harm cohesion at this size.
- **Exit criterion:** Module exceeds 250 lines OR new abstraction needs justify split.

### DEFER-5: Cycle-3 C3-AGG-9 / cycle-1 ARCH-3 — `compiler/execute.ts` size split
- **Severity:** LOW (maintainability)
- **Reason:** Same cycle-3 conditions; no new evidence to escalate.
- **Exit criterion:** Module exceeds 1000 lines OR a security finding is rooted in tangled code paths.

### DEFER-6: C1-AGG-11 — `submission-form.tsx` snapshot lost on unmount mid-fetch
- **Severity:** LOW (edge case — user navigates away during in-flight POST)
- **Reason:** `navigator.sendBeacon` is the right answer but requires more thought re: payload size limits and the difference between idle-tab unload and SPA navigation.
- **Exit criterion:** A reported real-user complaint about lost snapshots, OR a future cycle dedicated to anti-cheat heartbeat reliability.

### DEFER-7: C1-AGG-12 — Korean letter-spacing rule enforced ad-hoc
- **Severity:** LOW (drift risk)
- **Reason:** Custom ESLint rule design is non-trivial; a runtime utility component change touches many files.
- **Exit criterion:** Any reported regression where Korean text rendered with `tracking-*` lands in production.

### DEFER-8: C1-AGG-13 — AGENTS.md TOC
- **Severity:** LOW (developer ergonomics)
- **Reason:** Doc-only; doesn't affect gates.
- **Exit criterion:** Bandwidth in a future docs-focused cycle.

### DEFER-9: C1-AGG-14 — Source-grep tests → behavior tests
- **Severity:** LOW (test brittleness)
- **Reason:** Multi-week refactor; this cycle just patches the failing patterns. The ESLint approach in C1-AGG-12 is closer to first-class.
- **Exit criterion:** Cycle dedicated to test-architecture cleanup, OR a third independent test wave triggers the same drift.

### DEFER-10: C1-AGG-15 — `pre-restore-snapshot.ts` move to `lib/ops/`
- **Severity:** LOW (organization)
- **Reason:** Moving requires updating callers + git-blame churn for no behavior change.
- **Exit criterion:** Adjacent ops modules are extracted at the same time.

### DEFER-11: C1-AGG-18 — Recruit results empty-state copy
- **Severity:** LOW (UX polish)
- **Reason:** Fits naturally with future i18n / recruiting-flow polish cycle.
- **Exit criterion:** Recruiting cycle scheduled; or a recruiter complaint.

### DEFER-12: C1-AGG-19 — Submission form toast eviction
- **Severity:** LOW (theoretical edge)
- **Reason:** Sonner's eviction order would need direct verification first.
- **Exit criterion:** Reported case of users missing the cancel button.

### DEFER-13: C1-AGG-20 — Public-header md→lg breakpoint
- **Severity:** LOW (already accepted as designer tradeoff)
- **Reason:** Commit `37a4a8c3` was deliberate.
- **Exit criterion:** Tablet-user feedback indicates the change harmed UX.

---

## Progress

- [x] Plan written.
- [x] TASK-1 (28 test fixes) — DONE. All 305 test files / 2231 tests pass at HEAD.
  - [x] TASK-1.1 (users/core 1-arg API) — commit `336f74da`.
  - [x] TASK-1.2 (change-password 1-arg API) — commit `336f74da`.
  - [x] TASK-1.3 (judge/auth shared-token rejection) — commit `ef261646`.
  - [x] TASK-1.4 (bulkEnrollmentSchema 500 boundary) — commit `ef261646`.
  - [x] TASK-1.5 (capabilities/defaults assistant scope) — commit `cfddfb4c`.
  - [x] TASK-1.6 (ip-allowlist IPv6 CIDR) — commit `ef261646`.
  - [x] TASK-1.7 (group-members-bulk new shape) — commit `216d2266`.
  - [x] TASK-1.8 (use-source-draft jsdom shim) — commit `1f0644f2`.
  - [x] TASK-1.9 (deploy-security :? + hardcoded BUILD/POST/DELETE) — commit `f2b48558`.
  - [x] TASK-1.10 (12 source-grep tests, post-migration paths + i18n strip-comments + redirect-shell guards) — commits `2b8fd80b`, `812e2320`, `07f05b59`, `f2b48558`.
- [x] TASK-2 (recruit results scoring + regression test) — commit `b60dc17a`.
- [x] TASK-3 (pre-restore-snapshot 0o600 + streaming) — commit `6a6e7e75`.
- [x] TASK-4 (judge/auth `%s` log fix) — commit `95855085`.
- [x] TASK-5 (docker config-error containment) — commit `3ee75ef9`.
- [x] TASK-6 (data-retention parallel prune) — commit `0d843d91`.
- [x] TASK-11 (RETAIN_LAST_N rationale documented inline) — bundled with commit `6a6e7e75`.
- [x] TASK-13 (recruit-scoring regression test) — bundled with commit `b60dc17a`.
- [ ] TASK-7 (participant-status accepted→submitted comment) — DEFER per LOW priority below.
- [ ] TASK-8 (await pruneOldSnapshots) — DEFER per LOW.
- [ ] TASK-9 (reset lastSnapshotRef) — DEFER per LOW.
- [ ] TASK-10 (SECURITY.md docs) — DEFER per LOW.
- [ ] TASK-12 (pre-restore-snapshot unit test) — DEFER per LOW.
- [ ] TASK-14 (findings-index.md) — DEFER per LOW.

## Gate evidence (HEAD after all commits this cycle)

- `npm run lint` — exit 0.
- `npm run lint:bash` — exit 0.
- `npx tsc --noEmit` — exit 0.
- `npm run test:unit` — 305/305 files pass; 2231/2231 tests pass.
- `npm run test:security` — 11/11 files pass; 195/195 tests pass.
- `npm run build` — exit 0; production bundle generated.
- `npm run test:e2e` — NOT RUN this cycle (Playwright requires browsers + dev server; environment-blocked in this sandbox; defer per CLAUDE.md / repo rules — same gate-status as the last few cycles, see `_aggregate-cycle-3.md`).
