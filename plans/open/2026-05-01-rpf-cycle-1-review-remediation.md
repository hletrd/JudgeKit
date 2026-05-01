# Cycle 1 Review Remediation Plan (2026-05-01 RPF loop)

**Date:** 2026-05-01
**Source:** `.context/reviews/_aggregate.md` (cycle 1)
**Status:** IN PROGRESS

---

## Tasks

### Task A: [MEDIUM] Remove password validation checks that violate AGENTS.md policy (C1-AGG-1)

- **Source:** C1-AGG-1 (7-lane cross-agreement: C1-CR-1, C1-SR-1, C1-CT-1, C1-DB-2, C1-TR-1, C1-VE-1, C1-DOC-1)
- **Files:**
  - `src/lib/security/password.ts` — remove `COMMON_PASSWORDS`, username match, email match
  - All form components with `PasswordValidationError` error message maps
- **Fix:**
  1. Remove `COMMON_PASSWORDS` constant and its usage from `password.ts`
  2. Remove `"passwordMatchesUsername"`, `"passwordMatchesEmail"`, `"passwordTooCommon"` from `PasswordValidationError` type
  3. Remove the username match check (lines 49-56) from `getPasswordValidationError`
  4. Remove the email match check (lines 59-67) from `getPasswordValidationError`
  5. Remove the `context` parameter from `getPasswordValidationError` and `isStrongPassword` (no longer needed)
  6. Update all call sites that pass `context` to these functions
  7. Remove corresponding error message entries from form components:
     - `src/app/(auth)/signup/signup-form.tsx`
     - `src/app/(dashboard)/dashboard/admin/users/add-user-dialog.tsx`
     - `src/app/(dashboard)/dashboard/admin/users/edit-user-dialog.tsx`
     - `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx`
     - `src/app/change-password/change-password-form.tsx`
  8. Update server actions that call `isStrongPassword` / `getPasswordValidationError`:
     - `src/lib/actions/public-signup.ts`
     - `src/lib/actions/user-management.ts`
     - `src/lib/actions/change-password.ts`
  9. Update tests for `password.ts`
- **Exit criteria:** `password.ts` only checks `password.length < 8`, matching AGENTS.md policy. All form error maps updated. All tests pass.
- [ ] Done

### Task B: [LOW] Normalize `latestSubmittedAt` to Date before comparison (C1-AGG-2)

- **Source:** C1-AGG-2 (C1-CR-3, C1-DB-1)
- **Files:**
  - `src/lib/assignments/submissions.ts:625-627`
- **Fix:**
  1. Before the `row.latestSubmittedAt > existing.latestSubmittedAt` comparison, normalize both values to `Date`:
     ```ts
     const toMs = (v: string | Date | null): number | null => {
       if (!v) return null;
       return v instanceof Date ? v.getTime() : new Date(v).getTime();
     };
     ```
  2. Use `toMs()` for comparison instead of direct `>`.
- **Exit criteria:** `latestSubmittedAt` comparisons use numeric milliseconds, not mixed string/Date comparison.
- [ ] Done

### Task C: [LOW] Parallelize independent DB queries in `getAssignmentStatusRows` (C1-AGG-5)

- **Source:** C1-AGG-5 (C1-PR-2)
- **Files:**
  - `src/lib/assignments/submissions.ts:483-520`
- **Fix:**
  1. Run the 3 independent queries (assignment lookup, assignment problems, enrolled students) via `Promise.all`.
  2. The raw SQL aggregation must remain sequential since it depends on `assignment.deadline` and `assignment.latePenalty`.
- **Exit criteria:** 3 independent DB queries run in parallel in `getAssignmentStatusRows`.
- [ ] Done

### Task Z: Run all gates (lint, build, test, bash -n)

- Run `eslint`, `next build`, `vitest run`, `bash -n deploy*.sh`
- Fix any errors found
- [ ] Done

### Task ZZ: Archive this plan if all tasks complete

- Move this plan to `plans/done/` after all tasks are marked done
- [ ] Done

---

## Deferred Items

The following findings from the cycle 1 review are deferred this cycle with reasons:

| C1-AGG ID | Description | Severity | Reason for deferral | Exit criterion |
|-----------|-------------|----------|---------------------|----------------|
| C1-AGG-3 | `import.ts` uses `any` types | LOW | Low impact; internal utility only used during admin DB import | Import pipeline refactor cycle OR type-safety audit cycle |
| C1-AGG-4 | `compiler/execute.ts` chmod 0o770 | LOW | Ephemeral workspace mitigates; needs design decision on Docker-in-Docker vs standalone | Security audit of Docker-in-Docker workspace permissions OR operator reports unauthorized workspace access |
| C1-AGG-6 | No test enforces AGENTS.md password policy | LOW | Depends on resolution of C1-AGG-1 (Task A); tests will be updated as part of that task | C1-AGG-1 resolved |
| C3-AGG-2 | SSH/sudo credential rotation in deploy | LOW | Trigger not met | SSH/sudo credential rotation divergence on any target |
| C3-AGG-3 | SSH ControlSocket timeout in deploy | LOW | Trigger not met | Long-host wait OR ControlSocket connection refused |
| C3-AGG-5 | Deploy script modular extraction | LOW | Trigger not met | `deploy-docker.sh` >1500 lines OR 3 indep SSH-helpers edits |
| C3-AGG-6 | Peer-user awareness in deploy | LOW | Trigger not met | Multi-tenant deploy host added |
| C2-AGG-5 | Polling components not visibility-paused | LOW | Trigger not met | Telemetry signal or 7th instance |
| C2-AGG-6 | Practice page search perf | LOW | Trigger not met | p99 > 1.5s OR > 5k matching problems |
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

No security/correctness/data-loss findings deferred (C1-AGG-1 is scheduled for implementation this cycle).

---

## Notes

- C1-AGG-1 (password validation policy mismatch) is a policy-code alignment issue, not a security vulnerability. The extra checks are more restrictive than the documented policy, not less. The fix aligns the code with the documented policy.
- Task A will touch multiple files across the stack (validation, actions, forms, tests). Fine-grained commits are recommended: one for the core `password.ts` change, one for form updates, one for test updates.
- Task C (query parallelization) should be verified with a performance test if available, but the improvement is straightforward and low-risk.
