# RPF Cycle 1 (2026-05-01) — Aggregate Review

**Date:** 2026-05-01
**HEAD reviewed:** `894320ff` (docs(plans): mark cycle 11 RPF plan done; archive to plans/done/)
**Reviewers:** code-reviewer, perf-reviewer, security-reviewer, critic, architect, debugger, designer (source-level), document-specialist, test-engineer, tracer, verifier (11 lanes; per-agent files in `.context/reviews/rpf-cycle-1-<agent>.md`).

**Prior-cycle aggregate snapshot:** Preserved at `_aggregate-cycle-5.md` (last named snapshot). The live `_aggregate.md` is now overwritten with this cycle's findings.

---

## Total deduplicated NEW findings (still applicable at HEAD `894320ff`)

**0 HIGH, 1 MEDIUM, 5 LOW NEW.**

---

## Resolved at current HEAD (verified by inspection)

All prior-cycle resolved items remain resolved at HEAD `894320ff`. No new resolutions this cycle beyond the carry-forward registry.

---

## NEW findings this cycle

### C1-AGG-1: [MEDIUM] Password validation code contradicts AGENTS.md policy

- **Source:** C1-CR-1, C1-SR-1, C1-CT-1, C1-DB-2, C1-TR-1, C1-VE-1, C1-DOC-1 (7-lane cross-agreement)
- **File:** `src/lib/security/password.ts:13-68` vs `AGENTS.md:562-568`
- **Description:** `getPasswordValidationError()` enforces 3 additional checks beyond the 8-character minimum: common-password deny list, username match, and email local-part match. AGENTS.md explicitly states: "Password validation MUST only check minimum length — exactly 8 characters minimum, no other rules. Do NOT add complexity requirements (uppercase, numbers, symbols), similarity checks, or dictionary checks."
- **Confidence:** HIGH (7-lane cross-agreement)
- **Fix:** Remove `COMMON_PASSWORDS`, username match, and email match from `getPasswordValidationError`. Remove `passwordMatchesUsername`, `passwordMatchesEmail`, `passwordTooCommon` from `PasswordValidationError` type. Update error message maps in all 5+ form components. Update tests.

### C1-AGG-2: [LOW] `latestSubmittedAt` mixed-type comparison in submissions.ts

- **Source:** C1-CR-3, C1-DB-1 (2-lane)
- **File:** `src/lib/assignments/submissions.ts:625-627`
- **Description:** The comparison `row.latestSubmittedAt > existing.latestSubmittedAt` operates on `string | Date | null`. When PostgreSQL returns timestamps as strings vs Date objects depending on driver config, the `>` operator may produce incorrect ordering.
- **Confidence:** MEDIUM
- **Fix:** Normalize both sides to `Date` before comparison.

### C1-AGG-3: [LOW] `import.ts` uses `any` types bypassing compile-time safety

- **Source:** C1-CR-2, C1-AR-2 (2-lane)
- **File:** `src/lib/db/import.ts:19-24`
- **Description:** `TABLE_MAP: Record<string, any>` bypasses type safety for the entire import pipeline.
- **Confidence:** MEDIUM
- **Fix:** Use discriminated unions or `unknown` with type guards.

### C1-AGG-4: [LOW] `compiler/execute.ts` workspace chmod 0o770 may allow group access on shared hosts

- **Source:** C1-SR-2 (1-lane)
- **File:** `src/lib/compiler/execute.ts:660`
- **Description:** `chmod(workspaceDir, 0o770)` gives full read/write/execute to the group. On a shared host, this could allow unauthorized access. Ephemeral workspace mitigates.
- **Confidence:** LOW
- **Fix:** Consider 0o700 or document that 0o770 is intentional for Docker-in-Docker.

### C1-AGG-5: [LOW] `getAssignmentStatusRows` performs 4 sequential DB queries that could be parallelized

- **Source:** C1-PR-2 (1-lane)
- **File:** `src/lib/assignments/submissions.ts:483-601`
- **Description:** The first 3 DB queries (assignment lookup, assignment problems, enrolled students) have no data dependency and could run via `Promise.all`.
- **Confidence:** MEDIUM
- **Fix:** Use `Promise.all` for the 3 independent queries.

### C1-AGG-6: [LOW] No test enforces AGENTS.md password policy

- **Source:** C1-TE-1 (1-lane)
- **File:** Test coverage for `src/lib/security/password.ts`
- **Description:** Tests validate the current behavior (including the extra checks), not the documented policy. A policy-conformance test would have caught the drift.
- **Confidence:** HIGH
- **Fix:** After resolving C1-AGG-1, add tests that assert the documented policy.

---

## Carry-forward DEFERRED items (status verified at HEAD `894320ff`)

| ID | Severity | File+line | Status (this cycle) | Exit criterion |
| --- | --- | --- | --- | --- |
| C3-AGG-2 | LOW | `deploy-docker.sh:204-214` | DEFERRED | SSH/sudo credential rotation divergence on any target |
| C3-AGG-3 | LOW | `deploy-docker.sh:165-178` | DEFERRED | Long-host wait OR ControlSocket connection refused on flaky-network long-build |
| C3-AGG-5 | LOW | `deploy-docker.sh` whole + `deploy.sh:58-66` | DEFERRED | `deploy-docker.sh` >1500 lines OR `deploy.sh` invoked OR 3 indep cycles modify SSH-helpers |
| C3-AGG-6 | LOW | `deploy-docker.sh:182-191` | DEFERRED | Multi-tenant deploy host added OR peer-user awareness reported |
| C2-AGG-5 | LOW | 5 polling components | DEFERRED | Telemetry signal or 7th instance |
| C2-AGG-6 | LOW | `src/app/(public)/practice/page.tsx:417` | DEFERRED | p99 > 1.5s OR > 5k matching problems |
| C1-AGG-3 (prior) | LOW | 27 client `console.error` sites | DEFERRED | Telemetry/observability cycle opens |
| C5-SR-1 (prior) | LOW | `scripts/deploy-worker.sh:101-107` | DEFERRED | untrusted-source `APP_URL` OR operator sed collision report |
| DEFER-ENV-GATES | LOW | Env-blocked tests | DEFERRED | Fully provisioned CI/host with DATABASE_URL, Postgres, sidecar |
| D1 | MEDIUM | `src/lib/auth/` JWT clock-skew | DEFERRED | Auth-perf cycle |
| D2 | MEDIUM | `src/lib/auth/` JWT DB query per request | DEFERRED | Auth-perf cycle |
| AGG-2 | MEDIUM | `src/lib/security/in-memory-rate-limit.ts` Date.now() | DEFERRED | Rate-limit-time cycle |
| ARCH-CARRY-1 | MEDIUM | 20 raw API route handlers | DEFERRED | API-handler refactor cycle |
| ARCH-CARRY-2 | LOW | `src/lib/realtime/` SSE eviction | DEFERRED | SSE perf cycle |
| PERF-3 | MEDIUM | `src/lib/anti-cheat/` heartbeat gap query | DEFERRED | Anti-cheat perf cycle |
| C7-AGG-7 (carry) | LOW | `src/lib/security/encryption.ts` decrypt plaintext fallback | DEFERRED-with-doc-mitigation | Production tampering incident OR audit cycle |
| C7-AGG-9 (carry) | LOW | `src/lib/security/` rate-limit 3-module duplication | DEFERRED-with-doc-mitigation | Rate-limit consolidation cycle |

No HIGH findings deferred. No security/correctness/data-loss findings deferred.

---

## Cross-agent agreement summary (cycle 1)

- **C1-AGG-1 (password policy mismatch)**: 7-lane cross-agreement (code-reviewer, security-reviewer, critic, debugger, tracer, verifier, document-specialist). Highest signal finding this cycle.
- **C1-AGG-2 (latestSubmittedAt type comparison)**: 2-lane (code-reviewer, debugger).
- **C1-AGG-3 (import.ts any types)**: 2-lane (code-reviewer, architect).
- **Carry-forward items accurate at HEAD**: all 11 lanes agree.
- **No new HIGH findings**: all 11 lanes agree.

## Agent failures

None. All 11 reviewer perspectives produced artifacts in `.context/reviews/rpf-cycle-1-<agent>.md`.

---

## Implementation queue for PROMPT 3

1. **C1-AGG-1** — Remove extra password checks from `password.ts`. Update `PasswordValidationError` type. Update form error message maps. Update tests. One commit per logical step.
2. **C1-AGG-2** — Normalize `latestSubmittedAt` to `Date` before comparison in `submissions.ts`.
3. **C1-AGG-5** — Parallelize 3 independent DB queries in `getAssignmentStatusRows` with `Promise.all`.
4. **Gates** — run all gates per orchestrator directive.
5. **Deploy** — per-cycle if source code changes are committed.

Deferrable (recorded in plan with exit criteria):
- C1-AGG-3 (import.ts any types) — LOW, low impact
- C1-AGG-4 (chmod 0o770) — LOW, needs design decision
- C1-AGG-6 (password policy tests) — depends on C1-AGG-1 resolution
- All carry-forwards in the table above
