# Cycle 2 — security-reviewer

**Scope:** Full re-audit of JudgeKit at HEAD `ad543e14` (post cycle-1 Phase A). Regression-checked the 12 Phase A fixes, confirmed the Phase B backlog, and hunted new OWASP issues across API routes (`src/app/api/v1/**`), auth/security libs (`src/lib/auth/`, `src/lib/security/`), restore/export pipeline (`src/lib/db/`), judge IPC, and audit machinery.

**Risk Level: HIGH** — Twelve Phase A fixes hold; no regression bypasses introduced. The Phase B backlog is largely still open and one item (AGG-2 snapshot redaction) is more severe than first rated. One cycle-1 medium (SEC-9 community write-side IDOR) remains unfixed and is now re-confirmed.

## Summary

| Severity | Cycle-2 Findings |
|---|---|
| Critical | 0 |
| High | 2 (AGG-2 escalated; SEC-9 re-confirmed) |
| Medium | 2 (AGG-1, AGG-10) |
| Low | 5 |

---

## REGRESSION CHECK — 12 Phase A fixes

| ID | Item | Status | Notes |
|---|---|---|---|
| **A1** | env 0600 + startup guard | SECURE | `src/lib/security/env.ts:200-210` correctly checks `stats.mode & 0o077`; production-only; wired at `src/instrumentation.ts:29`. The six on-disk `.env*` files are now mode `-rw-------`. |
| **A2** | restore audit durable | PARTIAL | `src/app/api/v1/admin/restore/route.ts:168` correctly records audit AFTER `importDatabase()` commits (post-truncate). However, it calls non-durable `recordAuditEvent` (5s in-memory buffer). A hard crash (SIGKILL/OOM) in the window between commit and buffer flush loses the restore audit row. The durable variant `recordAuditEventDurable` exists (`events.ts:275`) and is the documented pattern for security-critical events. |
| **A3** | group DELETE IDOR | SECURE — NO BYPASS | `src/app/api/v1/groups/[id]/route.ts:192-217`: fetches `instructorId` inside the tx under `for("update")` (L199-204), calls `canManageGroupResourcesAsync` (L211-216), denies unless `caps.has("groups.view_all")`. No alternate path reaches `tx.delete`. |
| **A4** | student→co_instructor | SECURE | `src/app/api/v1/groups/[id]/instructors/route.ts:87-89` rejects `getRoleLevel(targetUser.role) <= 0` with 409. |
| **A5** | api-keys PATCH canManageRole on all fields | SECURE (minor gap) | `src/app/api/v1/admin/api-keys/[id]/route.ts:51` fetches `existing.role`; L86 `targetRole = body.role ?? existing.role`; L87-90 applies `canManageRoleAsync` to ALL mutations. Residual LOW-C2-5: the `user.role !== targetRole` clause permits same-role mutation, allowing a manager to downgrade an admin key to manager-level. No raw-key reveal. |
| **A6** | chat-widget sanitize + tool args | PARTIAL | `route.ts:373-376` sanitizes user messages; `route.ts:508` sanitizes tool results. Threat-surface comment promises Zod validation, but handlers use ad-hoc coercion. No bypass — `context.userId` scoping holds on every DB lookup. See LOW-C2-4. |
| **A7** | XFF ignore when TRUSTED_PROXY_HOPS=0 | SECURE | `src/lib/security/ip.ts:97`. When `=0`, the XFF branch is fully skipped and falls through to `x-real-ip`/socket. `getTrustedProxyHops` correctly distinguishes unset (→1) from explicit `=0`. |
| **A8** | compiler execute.ts logged-error | SECURE | `src/lib/compiler/execute.ts:64-83` replaced the import-time `throw` with `logger.error` + `COMPILER_RUNNER_CONFIG_ERROR`. |
| **A9** | function-judging export fields | SECURE | `src/app/api/v1/problems/[id]/export/route.ts:21-23` SELECTs the three function fields. Strict `canManageProblem` gate at L38. |
| **A10** | Rust validation env-race | SECURE | `judge-worker-rs/src/validation.rs:138-200` tests inject config via `_with_config` variants. No env mutation. |
| **A11** | problems/[id] GET strict canManageProblem | SECURE | `src/app/api/v1/problems/[id]/route.ts:65` routes GET through the imported strict `canManageProblem`. `referenceSolution` stripped for non-managers (L75). |
| **A12** | check-migration-drift git clean | SECURE | `scripts/check-migration-drift.sh:79-105` replaces `git clean -fd` with a Node diff-restore that only removes probe-created entries. |

**Regression verdict: 10/12 fully secure; 2/12 (A2, A6) functionally safe but partially complete. No bypasses found.**

---

## PHASE-B CONFIRMATION

| Item | Status | Evidence |
|---|---|---|
| **AGG-1** Restore DB-before-files atomicity | STILL VALID | `restore/route.ts:151` commits the DB transaction; `:183` then calls `restoreParsedBackupFiles`. If file restoration fails, DB references files that don't exist. Mitigated by `takePreRestoreSnapshot` (L149), not resolved. |
| **AGG-2** Snapshot redacts ALWAYS-columns | STILL VALID — ESCALATED to HIGH (see C2-1) | `src/lib/db/pre-restore-snapshot.ts:84-86` calls `streamDatabaseExport({ sanitize: false })`, but `src/lib/db/export.ts:104-106` still applies `EXPORT_ALWAYS_REDACT_COLUMNS`. Includes `users.passwordHash`, `sessions.sessionToken`, `accounts.*_token`, `apiKeys.encryptedKey`. |
| **AGG-10** Plaintext fallback default flip | STILL VALID | `src/lib/plugins/secrets.ts:61`: `allowPlaintext ?? true` — unchanged. No call site passes `allowPlaintextFallback:false`. |
| **AGG-14**/SEC-14 AUTH_URL enforcement | EFFECTIVELY FIXED | `src/lib/security/env.ts:127-132`: `validateAuthUrl()` now throws in production when `AUTH_URL` is missing. Mark **FIXED**. |
| **AGG-25..30** Authz medium queue | PARTIAL | SSE re-auth: DONE (`submissions/[id]/events/route.ts:458-503`). Community write-side IDOR (SEC-9): STILL UNFIXED — see C2-2. |
| **AGG-31..35** Crypto/config | PARTIAL | AUTH_URL enforcement: DONE. CSRF Origin-required (SEC-13): STILL UNFIXED — `src/lib/security/csrf.ts:56` still uses `if (origin && expectedHost)`, so missing Origin bypasses the check. |
| **AGG-41..43** Audit reliability | PARTIAL | CSV injection (AGG-42): FIXED — `src/lib/csv/escape-field.ts:13` prefixes `=+\-@\t\r` with tab. Unawaited `recordAuditEvent` in restore (AGG-41): only partially closed — post-commit move survived the truncate but non-durable buffer remains. |

---

## FINDINGS (NEW + RE-CONFIRMED)

### C2-1. Pre-restore snapshot is unrestoreable (AGG-2 escalated)
**Severity:** HIGH · **Confidence:** HIGH (A09 Recovery Integrity)
**Location:** `src/lib/db/pre-restore-snapshot.ts:84-86` × `src/lib/db/export.ts:104-106`
**Issue:** The snapshot is advertised as "the operator's emergency rollback artifact" and called "full-fidelity (sanitize=false)", but `streamDatabaseExport` applies `EXPORT_ALWAYS_REDACT_COLUMNS` even at `sanitize:false`. Those columns include `users.passwordHash` and `sessions.sessionToken`. A snapshot restored after a bad import yields a DB where **no user can authenticate** and **every active session is invalid**. The recovery path is itself broken.
**Blast radius:** Operator triggers a restore, realizes it's wrong, reaches for the snapshot — and finds it cannot be re-imported to recover logins. Single-instance deployments with no external DB backup face total lockout.
**Remediation:**
```ts
// BAD (src/lib/db/export.ts:104-106)
const activeRedactionMap = options.sanitize
  ? mergeRedactionMaps(EXPORT_SANITIZED_COLUMNS, EXPORT_ALWAYS_REDACT_COLUMNS)
  : EXPORT_ALWAYS_REDACT_COLUMNS;

// GOOD — add a "snapshot" mode that redacts NOTHING
type RedactionConfig = { sanitize: boolean; snapshot?: boolean };
export function streamDatabaseExport(options: RedactionConfig = {}) {
  const activeRedactionMap = options.snapshot
    ? {}
    : options.sanitize
      ? mergeRedactionMaps(EXPORT_SANITIZED_COLUMNS, EXPORT_ALWAYS_REDACT_COLUMNS)
      : EXPORT_ALWAYS_REDACT_COLUMNS;
}
// pre-restore-snapshot.ts:84 — pass { sanitize: false, snapshot: true }
```
The redaction was originally defense-in-depth against the snapshot file leaking secrets. That concern is already covered by the `0o600` file mode + `0o700` directory (verified `pre-restore-snapshot.ts:67,89`).

### C2-2. Community write-side IDOR (SEC-9 re-confirmed, still unfixed)
**Severity:** MEDIUM · **Confidence:** HIGH (A01 IDOR)
**Locations:**
- `src/app/api/v1/community/threads/[id]/posts/route.ts:38` — only gates `scopeType === "problem"`; missing `editorial` and `solution`.
- `src/app/api/v1/community/votes/route.ts:62-68` — gates `problem` + `editorial`; missing `solution`.
**Issue:** Write-side IDOR. Any authenticated user who learns a thread id can reply to or vote on `editorial`/`solution`-scoped threads they cannot access — the reference pattern at `src/app/api/v1/community/threads/route.ts:17` correctly checks all three scopes.
**Fix:**
```ts
// src/lib/discussions/permissions.ts
export const PROBLEM_LINKED_SCOPES = ["problem", "editorial", "solution"] as const;
export async function assertProblemScopedAccess(scopeType: string, problemId: string | null, user) {
  if (PROBLEM_LINKED_SCOPES.includes(scopeType) && problemId) {
    if (!(await canAccessProblem(problemId, user.id, user.role))) return forbidden();
  }
  return null;
}
```

### C2-3. Restore audit not crash-durable (A2 partial close)
**Severity:** MEDIUM · **Confidence:** HIGH (A09 Logging Integrity)
**Location:** `src/app/api/v1/admin/restore/route.ts:168`; also `src/app/api/v1/admin/migrate/import/route.ts:199`
**Issue:** Both restore and migrate-import write their post-commit audit row with the buffered `recordAuditEvent` rather than `recordAuditEventDurable`. A SIGKILL/OOM/container kill within the 5 s flush window discards the audit row for a destructive database-replace operation.
**Fix:** Replace `recordAuditEvent({...})` with `await recordAuditEventDurable({...})` at both call sites.

---

### LOW findings (capped at 5)

#### C2-4. Chat-widget tool args use ad-hoc coercion, not Zod (A6 partial)
**Severity:** LOW · **Confidence:** MEDIUM (A03)
**Location:** `src/lib/plugins/chat-widget/tools.ts:131` (`Number(args.limit)`), `:169` (`String(args.submissionId)`)
**Issue:** The threat-surface comment says each case "must Zod-validate `toolArgs` against a per-tool schema". Actual handlers do runtime coercion. No exploit today — `context.userId` re-scopes every DB lookup — but the documented contract is unmet.
**Fix:** Define per-tool Zod schemas and `.parse(args)` at the top of each handler.

#### C2-5. api-keys PATCH permits same-role mutation without canManageRoleAsync
**Severity:** LOW · **Confidence:** MEDIUM (A01)
**Location:** `src/app/api/v1/admin/api-keys/[id]/route.ts:88`
**Issue:** `if (!canManage && user.role !== targetRole)` allows a manager (role X) to mutate fields on a key whose role is also X without `canManageRoleAsync` authorizing it, including downgrading an admin key to manager-level (DoS on the admin's API key). Non-escalation (raw-key reveal is hard-disabled).
**Fix:** Drop the `user.role !== targetRole` clause: `if (!canManage) return apiError("cannotAssignHigherRole", 403);`.

#### C2-6. toggleUserActive docstring contradicts code (super_admin re-activation)
**Severity:** LOW · **Confidence:** HIGH (A04)
**Location:** `src/lib/actions/user-management.ts:70-72` (docstring) vs `:113` (guard)
**Issue:** Docstring says "super_admins cannot re-activate other super_admins" but the guard `if (targetLevel >= actorLevel && targetUser.role !== "super_admin")` skips when both are super_admin, so a super_admin CAN re-activate another. No real escalation (super_admin is apex), but the invariant is mis-documented and the `&&` clause is suspicious dead code.
**Fix:** Honor the docstring (drop the `&&` clause) or correct the docstring.

#### C2-7. Phase B deferral — AGG-10 plaintext-decryption default true
**Severity:** LOW (re-confirmed MEDIUM per cycle 1) · **Confidence:** HIGH (A02/A04)
**Location:** `src/lib/plugins/secrets.ts:61`
**Issue:** `allowPlaintext = options?.allowPlaintextFallback ?? true`. Full fix is the cycle-1 Phase B plan.

#### C2-8. Phase B deferral — CSRF Origin-required (SEC-13 / AGG-31)
**Severity:** LOW · **Confidence:** MEDIUM (A01)
**Location:** `src/lib/security/csrf.ts:56`
**Issue:** `if (origin && expectedHost)` — when Origin is absent, only `X-Requested-With` holds. Still unfixed.

---

## FINAL SWEEP

**OWASP coverage:**
- A01 IDOR/Access Control — A3, A4, A5, A11 re-verified; SEC-9/C2-2 re-confirmed; C2-5 residual.
- A02 Cryptographic Failures — env 0600 (A1) holds; AGG-10/C2-7 still open; AES-256-GCM + HKDF domain-separation sound.
- A03 Injection — Drizzle parameterized queries throughout; chat-widget prompt injection neutralized for messages+tool results (C2-4 partial).
- A04 Insecure Design — toggleUserActive doc drift (C2-6); AGG-2 design gap (C2-1).
- A05 Security Misconfiguration — env guard (A1) + production-config validator + XFF (A7) all hold.
- A06 Vulnerable Components — `npm audit`: 2 moderate (`postcss <8.5.10` bundled inside `next`, build-time only). No high/critical.
- A07 Auth Failures — role-escalation guards hold; DUMMY_PASSWORD_HASH still hardcoded (Phase C deferral, accepted).
- A08 Integrity — backup ZIP 3-layer (manifest + sha256 + size) intact.
- A09 Logging — AGG-42 CSV injection FIXED; AGG-41 audit durability partial (C2-3).
- A10 SSRF — no user-controlled outbound URL fetch; provider URLs hardcoded.

**Secrets scan:** On-disk `.env*` files all `-rw-------`. `LOGGER_REDACT_PATHS` covers `authorization`, `password*`, `*token`, `encryptedKey`, `hcaptchaSecret`, `smtpPass`, `runnerAuthToken`. No new hardcoded secrets.

**Verified clean (negative results):** SQL injection (parameter binding); path traversal (`SAFE_STORED_NAME_RE`, nanoid stored names, `..` rejection); XSS (`sanitizeHtml` + `react-markdown skipHtml`); command injection (argv-array Docker exec); SSRF (provider URLs hardcoded); file upload (MIME allowlist + size limit + magic-byte + zip-bomb guard); judge IPC (IP allowlist + bearer auth + claim-token fence); deserialization (every `JSON.parse` wrapped); rate limiting (IP + per-user + per-token buckets); audit integrity (`recordAuditEventDurable` for security-critical writes; CSV injection neutralized).

**Remediation priority:**
1. **Immediate (<24h):** C2-1 snapshot redaction bypass (escalate from Phase B; one-line `snapshot: true` mode).
2. **Urgent (<1wk):** C2-2 community write-side IDOR; C2-3 audit durability.
3. **Planned (<1mo):** C2-4 Zod per-tool, C2-5 tighten api-keys guard, C2-6 doc fix, plus remaining Phase B (AGG-1, AGG-10, AGG-31).

## Security Checklist
- [x] No hardcoded secrets (env files now 0600)
- [x] All inputs validated (Zod at API boundary; one internal contract gap at C2-4)
- [x] Injection prevention verified (parameterized queries, sanitized prompts)
- [x] Authentication/authorization verified (Phase A holds; two Phase B authz items open)
- [x] Dependencies audited (0 high/critical; 2 moderate via bundled `postcss`)
