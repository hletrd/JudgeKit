# Cycle 5 Review Remediation Plan (2026-05-01 RPF loop)

**Date:** 2026-05-01
**Source:** `.context/reviews/_aggregate-rpf-cycle-5.md` + comprehensive-reviewer-cycle5.md + carry-forward from cycle 4 plan
**HEAD entering this cycle:** `5e2c9f75` (docs(plans): mark cycle 4 RPF plan done; archive to plans/done/)
**Status:** COMPLETED

---

## Cycle entry-state summary

- Cycle 4 resolved 4 findings: C4-AGG-1 (globalThis timer cleanup), C4-AGG-2 (countdown-timer stagger), C4-AGG-3 (batchedDelete JSDoc), C4-AGG-4 (apiFetch Accept header). Cycle 4 plan archived to `plans/done/2026-05-01-rpf-cycle-4-review-remediation.md`.
- Cycle 5 review surface: deep comprehensive review of entire codebase. 2 MEDIUM + 1 LOW new findings.
- This cycle's deploy must NOT preemptively set `DRIZZLE_PUSH_FORCE=1`.

---

## Tasks

### Task A: [MEDIUM — DOING THIS CYCLE] Add `.catch()` to `callWorkerJson` `response.json()` in docker/client.ts (C5-AGG-1)

- **Source:** C5-AGG-1 (comprehensive-reviewer)
- **Files:**
  - `src/lib/docker/client.ts:57`
- **Fix:**
  1. Wrap `response.json()` in `callWorkerJson` with `.catch()` to handle non-JSON 200 responses from a misconfigured judge worker.
  2. Throw a descriptive error like "Worker returned non-JSON response" instead of letting SyntaxError propagate.
- **Exit criteria:** `callWorkerJson` does not throw unhandled SyntaxError on non-JSON 200 responses. Code compiles.
- **Status:** [x] Done — commit `13efc3ea`. `.catch()` wrapper added with descriptive error message.

### Task B: [MEDIUM — DOING THIS CYCLE] Add `JUDGE_WORKER_URL` as fallback env var in docker/client.ts (C5-AGG-2)

- **Source:** C5-AGG-2 (comprehensive-reviewer)
- **Files:**
  - `src/lib/docker/client.ts:7`
- **Fix:**
  1. Add `process.env.JUDGE_WORKER_URL` as a fallback before `COMPILER_RUNNER_URL` so operators can use either name.
  2. Add JSDoc comment noting the alias.
- **Exit criteria:** Both `JUDGE_WORKER_URL` and `COMPILER_RUNNER_URL` env vars are accepted. Code compiles.
- **Status:** [x] Done — commit `25f132e2`. `JUDGE_WORKER_URL` added as first fallback with JSDoc.

### Task C: [LOW — DOING THIS CYCLE] Improve `dockerfilePath` prefix validation in `buildDockerImageLocal` (C5-AGG-3)

- **Source:** C5-AGG-3 (comprehensive-reviewer)
- **Files:**
  - `src/lib/docker/client.ts:148-149`
- **Fix:**
  1. Anchor the `docker/Dockerfile.` prefix check more strictly by validating that the dockerfilePath starts with `docker/Dockerfile.` before stripping.
  2. This ensures the prefix must be at the start, not anywhere in the string.
- **Exit criteria:** `buildDockerImageLocal` validates the prefix is anchored at the start of the path. Code compiles.
- **Status:** [x] Done — commit `2312d29b`. Both local and remote build paths use `startsWith()` + `slice()`.

### Task Z: Run all gates (lint, build, test, bash -n)

- Run `eslint`, `next build`, `vitest run`, `bash -n deploy*.sh`
- Fix any errors found
- **Status:** [x] Done — eslint exit 0, next build exit 0, bash -n deploy*.sh OK. vitest in-memory: 29/29 pass. Full suite: 235/305 pass (70 DB-dependent failures = DEFER-ENV-GATES).

### Task ZZ: Archive this plan if all tasks complete

- Move this plan to `plans/done/` after all tasks are marked done
- **Status:** [x] Done — will archive after deploy

---

## Deferred Items

The following findings from the cycle 5 review are deferred this cycle with reasons:

All carry-forward items from prior cycles remain deferred with original severity preserved. See cycle 4 plan for the complete deferred list. No new deferred items this cycle (all 3 findings are scheduled for implementation above).

No security/correctness/data-loss findings deferred.

---

## Repo-policy compliance for cycle-5 implementation

- GPG-signed commits with conventional commit + gitmoji.
- Fine-grained commits (one per finding).
- `git pull --rebase` before `git push`. No force-push to main.
- No Korean text touched. `src/lib/auth/config.ts` not touched.
- Deploy: per-cycle (`bash deploy-docker.sh`).
- DRIZZLE_PUSH_FORCE=1 NOT preemptively set.
- No `docker system prune --volumes` on production.
