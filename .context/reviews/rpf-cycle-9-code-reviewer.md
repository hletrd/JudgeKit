# RPF Cycle 9 — Code Reviewer

**Date:** 2026-04-29
**HEAD reviewed:** `1bcdd485` (cycle-8 close-out: docs(plans) mark cycle 8 Tasks A/B/C/Z/ZZ done with deploy outcome).
**Change surface vs cycle-8 prior close `1c991812`:** 5 commits (`bf1aba17`, `1cdf79ed`, `d9cb15e6`, `9c8d072e`, `1bcdd485`); 18 files; +823 / -86 lines. Code/script touches: `README.md` (+10), `deploy-docker.sh` (+11/-3), `src/lib/security/api-rate-limit.ts` (+17 doc-only header), `src/lib/security/in-memory-rate-limit.ts` (+9 doc-only header).

## Inventory of review-relevant files (cycle 9)

- `README.md` — new "Time Synchronization" section (Task A close-out, cycle 8).
- `deploy-docker.sh` — soft cap on `DEPLOY_SSH_RETRY_MAX` (Task B close-out, cycle 8); env-var doc updated.
- `src/lib/security/api-rate-limit.ts` — top-of-file orientation comment added (Task C, cycle 8).
- `src/lib/security/in-memory-rate-limit.ts` — extended top-of-file orientation comment (Task C, cycle 8).
- `plans/done/2026-04-29-rpf-cycle-7-review-remediation.md` — archived.
- `plans/open/2026-04-29-rpf-cycle-8-review-remediation.md` — cycle-8 plan, status DONE.
- `.context/reviews/rpf-cycle-8-*.md` (11 files) and `_aggregate.md` — review artifacts.

## Cross-file interactions checked

- `deploy-docker.sh` cap interacts with the existing fallback: positive-integer fallback is at lines 226-229; cap is at lines 232-238. The order is correct — fallback first (forces `max_attempts=4` for non-integer/<1 inputs), cap second (clamps to 100 for excess values). A user setting `DEPLOY_SSH_RETRY_MAX=0` triggers fallback to 4 (not the cap), which is the correct behavior. A user setting `DEPLOY_SSH_RETRY_MAX=10000` triggers the cap to 100 with a clear log line.
- `api-rate-limit.ts` and `in-memory-rate-limit.ts` orientation comments correctly cross-reference each other and `rate-limit.ts`. The "if you fix a bug here, search the other two modules for the same pattern and apply the equivalent fix" guidance is correct given the documented C7-AGG-9 deferral.
- `README.md` "Time Synchronization" section correctly cites the regression test file path `tests/unit/api/time-route-db-time.test.ts` (verified to exist at HEAD).

## Findings

**0 NEW HIGH / MEDIUM / LOW.**

The cycle-8 implementation correctly:
1. Preserves the operator-override knob (cap is a *soft* cap; warn + clamp, not fail).
2. Uses `(( max_attempts > 100 ))` arithmetic test (not string `[`), which is the correct bash idiom for integer comparison after the prior validation guarantees integer-ness.
3. Adds the cap doc to the env-var documentation block at the top of the file (lines 48-54), keeping doc-and-implementation in sync.
4. The orientation comments do not duplicate code; they only cross-reference. No drift introduced by this cycle's diff.

## Path drift / count drift sweep (carry-forward registry)

Re-counted at HEAD `1bcdd485`:
- C1-AGG-3 client `console.error` sites: **24** (unchanged from cycle 8). Verified via `grep -rn "console.error" src/components/ src/app/ | grep -v "/api/" | wc -l = 24`.
- C2-AGG-5 polling sites: **5** distinct files unchanged (`submission-list-auto-refresh.tsx`, `submissions/submission-detail-client.tsx`, `layout/active-timed-assignment-sidebar-panel.tsx`, `exam/anti-cheat-monitor.tsx`, `exam/countdown-timer.tsx`).
- `deploy-docker.sh` line count: **1088** (was 1076 cycle 8; +12 from Task B cap implementation). Trigger threshold is 1500 — gap closing slowly. Severity unchanged.
- `deploy.sh` line count: **289** (unchanged).

## Confidence

- High on "0 NEW findings"; the diff is small and entirely additive (doc + soft cap + JSDoc).
- Medium on "1088-line `deploy-docker.sh` cap-touches the SSH-helpers area for the third time" — this is the third independent cycle modifying SSH-helpers (cycle 5 added SSH retry telemetry; cycle 6 made initial-ssh-check max_attempts overridable; cycle 8 added the soft cap). Per the cycle-8 plan's Task D notes, three cycles is the trigger for scheduling the modular extraction (C3-AGG-5). However, given the orchestrator's guidance to be cautious about scope, recommend leaving the refactor scheduled for a dedicated next cycle rather than this one.

## Recommendation

Cycle-9 is a clean status-quo cycle. Backlog draw-down candidates for this cycle (LOW severity, narrow scope):
1. **DEFER-ENV-GATES test-runner pool tuning** — the gate output shows vitest pool fork-spawn errors and worker spawn timeouts on test:unit and test:component. These are environmental (limited fork capacity in dev shell) but a partial mitigation could be to lower vitest pool size in `vitest.config.ts` to reduce contention. Out-of-scope for this cycle unless explicitly picked.
2. **C7-AGG-7 plaintext fallback in `encryption.ts:79-81`** — could add a unit test asserting the fallback path is unreachable for legitimately ciphertext-shaped inputs. Doc-only mitigation also possible. LOW.
3. **C3-AGG-5 modular-extraction trigger** — third independent SSH-helpers touch landed; recommend explicit acknowledgment in cycle-9 plan that next SSH-helpers modification triggers refactor scheduling.

No HIGH/MEDIUM new findings. Recommend cycle-9 take a small, doc-leaning backlog draw-down.
