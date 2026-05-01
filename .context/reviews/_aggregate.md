# RPF Cycle 2 (2026-05-01) — Aggregate Review

**Date:** 2026-05-01
**HEAD reviewed:** `70c02a02` (docs(plans): mark cycle 1 RPF plan done; archive to plans/done/)
**Reviewers:** code-reviewer, perf-reviewer, security-reviewer, critic, architect, debugger, designer (source-level), document-specialist, test-engineer, tracer, verifier (11 lanes; per-agent files in `.context/reviews/rpf-cycle-2-<agent>.md`).

**Prior-cycle aggregate snapshot:** Preserved at `_aggregate-cycle-48.md` (last named snapshot). The live `_aggregate.md` is now overwritten with this cycle's findings.

---

## Total deduplicated NEW findings (still applicable at HEAD `70c02a02`)

**0 HIGH, 1 MEDIUM, 4 LOW NEW.**

---

## Resolved at current HEAD (verified by inspection)

Cycle-1 findings confirmed RESOLVED at HEAD `70c02a02`:
- **C1-AGG-1 (password policy mismatch)**: RESOLVED. `password.ts` now only checks `password.length < 8`. All form error maps updated. Tests updated.
- **C1-AGG-2 (latestSubmittedAt type comparison)**: RESOLVED. `submissions.ts:625-627` now uses `new Date()` normalization.
- **C1-AGG-5 (query parallelization)**: RESOLVED. `submissions.ts:510` uses `Promise.all` for initial 3 queries.
- **C1-AGG-6 (password policy tests)**: RESOLVED. Tests now assert minimum-length-only policy.

---

## NEW findings this cycle

### C2-AGG-1: [MEDIUM] encryption.ts module-level JSDoc says "base64" but code uses "hex"

- **Source:** C2-CR-1, C2-SR-1, C2-CT-1, C2-AR-1, C2-DB-1, C2-TR-1, C2-VE-1, C2-DOC-1 (8-lane cross-agreement)
- **File:** `src/lib/security/encryption.ts:5-6`
- **Description:** Module-level JSDoc says "followed by base64(IV || authTag || ciphertext)" but the actual implementation (line 78) uses `toString("hex")`. The `decrypt()` function (lines 127-129) uses `Buffer.from(..., "hex")`. The function-level JSDoc at line 64 correctly says "hex-encoded string". The code is internally consistent and works correctly, but the module-level JSDoc is wrong. Anyone reading the docs and implementing decryption in another language or tool would use base64 decoding on hex-encoded data, producing silent data corruption.
- **Confidence:** HIGH (8-lane cross-agreement)
- **Fix:** Change "base64(IV || authTag || ciphertext)" to "hex(IV || authTag || ciphertext)" on lines 5-6.

### C2-AGG-2: [LOW] Dead `_context` parameter in validateAndHashPassword

- **Source:** C2-CR-2, C2-SR-2, C2-CT-2, C2-AR-2, C2-DB-2 (5-lane)
- **File:** `src/lib/users/core.ts:57` (definition), `src/app/api/v1/users/bulk/route.ts:73-76` (call site)
- **Description:** `validateAndHashPassword` accepts `_context?: { username?: string; email?: string | null }` but it's prefixed `_` (unused). After cycle 1's removal of username/email/password checks, the parameter is dead code. `bulk/route.ts:73-76` still passes it. Other call sites correctly omit it.
- **Confidence:** HIGH
- **Fix:** Remove `_context` parameter from `validateAndHashPassword`. Update bulk/route.ts call site.

### C2-AGG-3: [LOW] Type assertion bypasses type safety in isNaN check

- **Source:** C2-CR-3 (1-lane)
- **File:** `src/lib/assignments/submissions.ts:664`
- **Description:** `isNaN(bestScore as number)` uses a type assertion to bypass TypeScript. At this point `bestScore` is `number | null`. The `as number` cast hides the null possibility. While the NaN check would still work at runtime (isNaN(null) is false), the assertion is misleading.
- **Confidence:** MEDIUM
- **Fix:** Use explicit narrowing: `if (bestScore !== null && isNaN(bestScore)) bestScore = null;`

### C2-AGG-4: [LOW] Further parallelization opportunity in getAssignmentStatusRows

- **Source:** C2-CR-4, C2-PR-1 (2-lane)
- **File:** `src/lib/assignments/submissions.ts:563-646`
- **Description:** The `overrideRows` query (line 639-646) is independent of `problemAggRows` (line 563-602) and could run in parallel with it via `Promise.all`.
- **Confidence:** MEDIUM
- **Fix:** Run `rawQueryAll` and the overrides query via `Promise.all`.

### C2-AGG-5: [LOW] No test verifying encryption format matches documentation

- **Source:** C2-TE-1 (1-lane)
- **File:** Test coverage for `src/lib/security/encryption.ts`
- **Description:** No test verifies the encrypted value format described in JSDoc matches the actual encoding. If such a test existed, the C2-AGG-1 mismatch would have been caught earlier.
- **Confidence:** MEDIUM
- **Fix:** Add a test that encrypts a value and verifies the format is `enc:` + hex-encoded components.

---

## Carry-forward DEFERRED items (status verified at HEAD `70c02a02`)

| ID | Severity | File+line | Status (this cycle) | Exit criterion |
| --- | --- | --- | --- | --- |
| C3-AGG-2 | LOW | `deploy-docker.sh:204-214` | DEFERRED | SSH/sudo credential rotation divergence on any target |
| C3-AGG-3 | LOW | `deploy-docker.sh:165-178` | DEFERRED | Long-host wait OR ControlSocket connection refused on flaky-network long-build |
| C3-AGG-5 | LOW | `deploy-docker.sh` whole + `deploy.sh:58-66` | DEFERRED | `deploy-docker.sh` >1500 lines OR `deploy.sh` invoked OR 3 indep cycles modify SSH-helpers |
| C3-AGG-6 | LOW | `deploy-docker.sh:182-191` | DEFERRED | Multi-tenant deploy host added OR peer-user awareness reported |
| C2-AGG-5 (prior) | LOW | 5 polling components | DEFERRED | Telemetry signal or 7th instance |
| C2-AGG-6 (prior) | LOW | `src/app/(public)/practice/page.tsx:417` | DEFERRED | p99 > 1.5s OR > 5k matching problems |
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
| C1-AGG-4 (prior) | LOW | `src/lib/compiler/execute.ts:660` chmod 0o770 | DEFERRED | Security audit of Docker-in-Docker workspace permissions OR operator reports unauthorized access |

No HIGH findings deferred. No security/correctness/data-loss findings deferred.

---

## Cross-agent agreement summary (cycle 2)

- **C2-AGG-1 (encryption JSDoc mismatch)**: 8-lane cross-agreement (code-reviewer, security-reviewer, critic, architect, debugger, tracer, verifier, document-specialist). Highest signal finding this cycle.
- **C2-AGG-2 (dead _context parameter)**: 5-lane (code-reviewer, security-reviewer, critic, architect, debugger).
- **C2-AGG-3 (isNaN type assertion)**: 1-lane (code-reviewer).
- **C2-AGG-4 (further parallelization)**: 2-lane (code-reviewer, perf-reviewer).
- **C2-AGG-5 (encryption format test)**: 1-lane (test-engineer).
- **No new HIGH findings**: all 11 lanes agree.
- **All carry-forward items accurate at HEAD**: all 11 lanes agree.

## Agent failures

None. All 11 reviewer perspectives produced artifacts in `.context/reviews/rpf-cycle-2-<agent>.md`.

---

## Implementation queue for PROMPT 3

1. **C2-AGG-1** — Fix encryption.ts module-level JSDoc: change "base64" to "hex" on lines 5-6. One-line fix.
2. **C2-AGG-2** — Remove dead `_context` parameter from `validateAndHashPassword`. Update `bulk/route.ts` call site.
3. **C2-AGG-3** — Fix isNaN type assertion in `submissions.ts:664`. Use explicit null narrowing.
4. **C2-AGG-4** — Parallelize overrides query with problemAggRows in `submissions.ts`.
5. **Gates** — run all gates per orchestrator directive.
6. **Deploy** — per-cycle if source code changes are committed.

Deferrable (recorded in plan with exit criteria):
- C2-AGG-5 (encryption format test) — LOW, test gap
- All carry-forwards in the table above
