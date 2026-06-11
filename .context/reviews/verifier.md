# Verifier (evidence-based correctness) — RPF Cycle 3 (2026-06-11)

**HEAD reviewed:** 63429d97. Job: check that what cycles 1–2 (and the docs) CLAIM matches what the code DOES, with executed evidence where possible.

## Executed baseline on this exact HEAD
- `npx tsc --noEmit` → exit 0.
- `npm run test:unit` → 333 files / 2579 tests PASS (35.2 s).
- `npm run lint` (eslint) → 0 errors / 0 warnings.
- `npm run lint:bash` → clean.

## Claim-vs-code results

### V3-1 — FALSE CLAIM: `docs/exam-integrity-model.md:55` "submission is rejected with HTTP 403 antiCheatHeartbeatRequired" (MEDIUM, High, CONFIRMED mismatch)
Code at `src/lib/assignments/submissions.ts:328-355` deliberately fails OPEN: it inserts a `submission_stale_heartbeat` anti-cheat event and lets the submission through (rationale comment cites fairness/legal harm of blocking at deadline on flaky networks). `antiCheatHeartbeatRequired` exists only as an unused union member (`submissions.ts:36`); no `grep` hit returns it. The doc's "What this closes: a candidate cannot submit code with curl..." is therefore wrong — the curl path is *flagged*, not closed. Doc carries `_Last updated: 2026-06-11_`, making the error look current. Must be corrected.

### V3-2 — Cross-feature contract violation: extension honored by submissions but not by the anti-cheat ingest (MEDIUM-HIGH, High, CONFIRMED)
`extendExamSession`'s own docstring (`exam-sessions.ts:127-137`) promises "the result MAY exceed the assignment deadline by design — validateAssignmentSubmission honors the per-session deadline". Verified TRUE for submissions (`submissions.ts:259-271`) and late-penalty scoring (`:641-655`). Verified FALSE for the anti-cheat POST (`contests/[assignmentId]/anti-cheat/route.ts:102-104` rejects on `assignment.deadline` only). The stated invariant ("late-penalty scoring already keys on personal_deadline too") is incomplete: one consumer of the exam-time contract was missed. Same finding as CR3-1/SEC3-1; recorded here as the verified breach of a stated behavior.

### Cycle-2 plan claims re-verified from code (all TRUE)
- G1: `deploy-docker.sh` defaults the no-filter path to sequential per-language builds (line ~715 `LANGUAGE_BUILD_STRATEGY:-sequential`), `run_remote_build` wraps app/worker/sidecar/language/WORKER_HOSTS builds, signature regex `unknown blob sha256:[a-f0-9]+ in history`, retry exactly once. Pipeline exit correctness holds under `set -euo pipefail` (line 94).
- G2: code-snapshots route gates `isJudgeLanguage` (route.ts:37-39); `codeSnapshots: 180` in DATA_RETENTION_DAYS with `CODE_SNAPSHOT_RETENTION_DAYS` override; `pruneCodeSnapshots` in the allSettled set; policy-doc row present.
- G3: `tests/unit/infra/retention-coverage.test.ts` walks pgTable exports with exact allowlist + walker-sanity assertion.
- G4: all four rate-limit sites conflict-safe; login module consolidated onto shared upsert; lost-race tests present (`api-rate-limit.test.ts`, `rate-limit.test.ts`).
- G5: `ExamDeadlineSync` exists, windowed-branch only, later-only contract, toast + role=status note in en+ko, router.refresh; 6 component tests; mounts in the expired state too (extension after expiry recovers without manual reload).
- G6: extend dialog has inputMode=numeric, form submit on Enter, Cancel.
- G7: review-root contains only current-cycle files + `_archive/`.
- Deploy record: orchestrator-confirmed all three targets 200 at 2f06913c; this cycle starts from that state plus the two test/docs commits (a0570eda, 2f06913c, 63429d97 touch no runtime code — verified by `git show --stat`).

### V3-3 — Smoke-spec expectation does not match deployed reality on branded instances (LOW-MEDIUM, High, CONFIRMED — from cycle-2's own deploy log)
`tests/e2e/public-shell.spec.ts:13` (`/Write code|코드를/i`) and `tests/e2e/responsive-layout.spec.ts:81` (`/JudgeKit|Write code|구조|코딩/`) assert the default-instance hero heading, but the homepage h1 is instance-configurable via `system_settings.homePageContent` (`src/app/page.tsx:31,67`). On oj.auraedu.me the h1 is "AuraEdu Online Judge" → the smoke fails while the page is healthy (cycle-2 deploy record documents exactly this). A smoke that cries wolf on a healthy instance trains operators to ignore it. Fix: env-overridable expected-heading pattern (e.g. `E2E_HOME_HEADING`) with the current default, set per remote target.

Nothing else asserted by cycles 1–2 failed verification.
