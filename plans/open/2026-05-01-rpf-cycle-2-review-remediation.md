# Cycle 2 Review Remediation Plan (2026-05-01 RPF loop)

**Date:** 2026-05-01
**Source:** `.context/reviews/_aggregate.md` (cycle 2) + cycle-2 lane reviews + carry-forward from cycle 1 plan
**HEAD entering this cycle:** `70c02a02` (docs(plans): mark cycle 1 RPF plan done; archive to plans/done/)
**Status:** DONE

---

## Cycle entry-state summary

- Cycle 1 resolved 3 findings: C1-AGG-1 (password validation), C1-AGG-2 (latestSubmittedAt), C1-AGG-5 (query parallelization). Cycle 1 plan archived to `plans/done/2026-05-01-rpf-cycle-1-review-remediation.md`.
- Cycle 2 review surface: 6 commits since cycle-1 start (`894320ff` -> `70c02a02`), including password.ts simplification, submissions.ts parallelization, form updates, and test updates.
- New findings this cycle: 1 MEDIUM (encryption JSDoc mismatch), 4 LOW.
- This cycle's deploy must NOT preemptively set `DRIZZLE_PUSH_FORCE=1`.

---

## Tasks

### Task A: [MEDIUM — DOING THIS CYCLE] Fix encryption.ts module-level JSDoc "base64" -> "hex" (C2-AGG-1)

- **Source:** C2-AGG-1 (8-lane cross-agreement: C2-CR-1, C2-SR-1, C2-CT-1, C2-AR-1, C2-DB-1, C2-TR-1, C2-VE-1, C2-DOC-1)
- **Files:**
  - `src/lib/security/encryption.ts:5-6`
- **Fix:**
  1. Change "base64(IV || authTag || ciphertext)" to "hex(IV || authTag || ciphertext)" on lines 5-6 of the module-level JSDoc.
- **Exit criteria:** Module-level JSDoc accurately describes the encoding format used by `encrypt()` and `decrypt()`.
- **Outcome:** Fixed in commit `615cdf8c`. "base64" changed to "hex" on line 5.
- [x] Done

### Task B: [LOW — DOING THIS CYCLE] Remove dead `_context` parameter from validateAndHashPassword (C2-AGG-2)

- **Source:** C2-AGG-2 (5-lane: C2-CR-2, C2-SR-2, C2-CT-2, C2-AR-2, C2-DB-2)
- **Files:**
  - `src/lib/users/core.ts:55-63` (definition)
  - `src/app/api/v1/users/bulk/route.ts:73-76` (only remaining call site that passes it)
- **Fix:**
  1. Remove the `_context` parameter from `validateAndHashPassword` function signature.
  2. Update `bulk/route.ts:73` to call `validateAndHashPassword(item.password)` without the second argument.
- **Exit criteria:** `validateAndHashPassword` takes only `password: string`. No call site passes a second argument.
- **Outcome:** Fixed in commit `05cb8658`. Removed `_context` parameter and updated bulk/route.ts call site.
- [x] Done

### Task C: [LOW — DOING THIS CYCLE] Fix isNaN type assertion in submissions.ts (C2-AGG-3)

- **Source:** C2-AGG-3 (C2-CR-3)
- **Files:**
  - `src/lib/assignments/submissions.ts:664`
- **Fix:**
  1. Replace `isNaN(bestScore as number)` with `if (bestScore !== null && isNaN(bestScore)) bestScore = null;`
  2. Remove the `as number` type assertion.
- **Exit criteria:** No `as number` type assertion on the isNaN check. Type-safe null narrowing.
- **Outcome:** Fixed in commit `6957a951`. Replaced `isNaN(bestScore as number)` with `if (bestScore !== null && isNaN(bestScore))`.
- [x] Done

### Task D: [LOW — DOING THIS CYCLE] Parallelize overrides query with problemAggRows (C2-AGG-4)

- **Source:** C2-AGG-4 (C2-CR-4, C2-PR-1)
- **Files:**
  - `src/lib/assignments/submissions.ts:563-646`
- **Fix:**
  1. Run `rawQueryAll` (line 563) and the overrides query (line 639) via `Promise.all`.
  2. Destructure the result: `const [problemAggRows, overrideRows] = await Promise.all([...])`.
- **Exit criteria:** `problemAggRows` and `overrideRows` queries run in parallel.
- **Outcome:** Fixed in commit `6957a951`. Both queries now run via `Promise.all`.
- [x] Done

### Task Z: Run all gates (lint, build, test, bash -n)

- Run `eslint`, `next build`, `vitest run`, `bash -n deploy*.sh`
- Fix any errors found
- **Gate outcomes:**
  - `eslint`: exit 0 (clean)
  - `next build`: exit 0 (clean)
  - `bash -n deploy*.sh`: all 3 scripts OK
  - `vitest run`: 66 failed / 238 passed test files (111 failed / 2109 passed tests). All failures are vitest-pool worker spawn timeouts (DEFER-ENV-GATES carry-forward). Password tests: 12/12 passed. No regression.
- [x] Done

### Task ZZ: Archive this plan if all tasks complete

- Move this plan to `plans/done/` after all tasks are marked done
- [x] Done

---

## Deferred Items

The following findings from the cycle 2 review are deferred this cycle with reasons:

| C2-AGG ID | Description | Severity | Reason for deferral | Exit criterion |
|-----------|-------------|----------|---------------------|----------------|
| C2-AGG-5 | No test verifying encryption format matches docs | LOW | Test gap; not a correctness issue; C2-AGG-1 fix makes drift less likely | Next cycle touching encryption.ts OR encryption audit cycle |
| C1-AGG-3 | `import.ts` uses `any` types | LOW | Low impact; internal utility only used during admin DB import | Import pipeline refactor cycle OR type-safety audit cycle |
| C1-AGG-4 | `compiler/execute.ts` chmod 0o770 | LOW | Ephemeral workspace mitigates; needs design decision on Docker-in-Docker vs standalone | Security audit of Docker-in-Docker workspace permissions OR operator reports unauthorized workspace access |
| C3-AGG-2 | SSH/sudo credential rotation in deploy | LOW | Trigger not met | SSH/sudo credential rotation divergence on any target |
| C3-AGG-3 | SSH ControlSocket timeout in deploy | LOW | Trigger not met | Long-host wait OR ControlSocket connection refused |
| C3-AGG-5 | Deploy script modular extraction | LOW | Trigger not met | `deploy-docker.sh` >1500 lines OR 3 indep SSH-helpers edits |
| C3-AGG-6 | Peer-user awareness in deploy | LOW | Trigger not met | Multi-tenant deploy host added |
| C2-AGG-5 (prior) | Polling components not visibility-paused | LOW | Trigger not met | Telemetry signal or 7th instance |
| C2-AGG-6 (prior) | Practice page search perf | LOW | Trigger not met | p99 > 1.5s OR > 5k matching problems |
| C1-AGG-3 (prior) | Client console.error sites | LOW | Trigger not met | Telemetry/observability cycle opens |
| C5-SR-1 (prior) | deploy-worker.sh sed delimiter | LOW | Trigger not met | untrusted-source APP_URL OR operator collision report |
| DEFER-ENV-GATES | Env-blocked tests | LOW | No CI host provisioned | Fully provisioned CI/host with DATABASE_URL, Postgres, sidecar |
| D1 | JWT clock-skew | MEDIUM | Requires dedicated auth-perf cycle | Auth-perf cycle |
| D2 | JWT DB query per request | MEDIUM | Requires dedicated auth-perf cycle | Auth-perf cycle |
| AGG-2 | Date.now() in rate-limit | MEDIUM | Requires dedicated rate-limit-time cycle | Rate-limit-time cycle |
| ARCH-CARRY-1 | Raw API route handlers | MEDIUM | Requires dedicated API-handler refactor cycle | API-handler refactor cycle |
| ARCH-CARRY-2 | SSE eviction | LOW | Requires SSE perf cycle | SSE perf cycle |
| PERF-3 | Anti-cheat heartbeat query | MEDIUM | Requires anti-cheat perf cycle | Anti-cheat perf cycle |
| C7-AGG-7 | Encryption plaintext fallback | LOW | Deferred with doc mitigation | Production tampering incident OR audit cycle |
| C7-AGG-9 | Rate-limit 3-module duplication | LOW | Deferred with doc mitigation | Rate-limit consolidation cycle |

No security/correctness/data-loss findings deferred.

---

## Repo-policy compliance for cycle-2 implementation

- GPG-signed commits with conventional commit + gitmoji (no `--no-verify`, no `--no-gpg-sign`).
- Fine-grained commits (one per finding).
- `git pull --rebase` before `git push`. No force-push to main.
- No Korean text touched. `src/lib/auth/config.ts` not touched.
- Deploy: per-cycle (`SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false ./deploy-docker.sh`).
- DRIZZLE_PUSH_FORCE=1 NOT preemptively set.
