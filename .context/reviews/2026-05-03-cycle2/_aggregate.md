# Aggregate Review — Cycle 2 (2026-05-03)

**Date:** 2026-05-03
**HEAD reviewed:** `689cf61d`
**Reviewers:** code-reviewer, perf-reviewer, security-reviewer, critic, architect, debugger, verifier, tracer, test-engineer, document-specialist, designer (11 lanes; per-agent files in `.context/reviews/2026-05-03-cycle2/<agent>.md`).

---

## Total deduplicated NEW findings (applicable at HEAD `689cf61d`)

**1 HIGH, 5 MEDIUM, 12 LOW NEW.**

---

## Deduplicated Findings (merged across agents, preserving highest severity)

### F1 (HIGH, HIGH confidence) — Recruiting token lacks brute-force protection on redeem path
**Cross-agent agreement:** C2-SEC-1, C2-TR-1, C2-CRIT-3 (3 lanes)

The recruiting token is single-factor auth. The login rate limiter is cleared on success (`clearRateLimitMulti`), which means a valid token+password resets the counter. An attacker with one valid credential can brute-force other tokens without hitting rate limits. Additionally, `redeemRecruitingToken` itself has no per-token lockout. The SQL `=` comparison for token hash lookup is not timing-safe.

**Fix:** (1) Do NOT clear the IP rate limiter for recruiting token re-entry. (2) Add per-token failed-redeem tracking. (3) Consider timing-safe hash comparison for token lookups.

---

### F2 (MEDIUM, HIGH confidence) — Candidate PII stored and returned in plaintext (carry-forward from C1-F3)
**Cross-agent agreement:** C2-CR-1, C2-SEC-2 (2 lanes)

`candidateName` and `candidateEmail` in `recruitingInvitations` are stored unencrypted and returned in full in API responses. The encryption module exists with `allowPlaintextFallback` for migration compatibility.

**Fix:** Apply `encrypt()`/`decrypt()` to PII columns. Use `allowPlaintextFallback: true` during migration.

---

### F3 (MEDIUM, HIGH confidence) — Audit event buffer silently drops events on persistent DB failure
**Cross-agent agreement:** C2-CR-3, C2-SEC-4 (2 lanes)

When `flushAuditBuffer` fails AND `_auditBuffer.length + batch.length >= FLUSH_SIZE_THRESHOLD * 2`, events are silently dropped with no counter increment or log. This violates audit integrity guarantees.

**Fix:** Add a `droppedAuditEvents` counter. Expose in admin health endpoint. Emit a log line for every dropped batch.

---

### F4 (MEDIUM, HIGH confidence) — Magic-byte verification allows unknown MIME types by default
**Cross-agent agreement:** C2-VER-1 (1 lane)

`verifyFileMagicBytes` returns `true` when no signature is defined for a MIME type. Adding a new MIME type to `ALLOWED_ATTACHMENT_TYPES` without adding a signature bypasses content verification.

**Fix:** Change default to reject unknown MIME types. Require explicit opt-out for types where verification is infeasible.

---

### F5 (MEDIUM, HIGH confidence) — JWT callback DB query on every authenticated request (carry-forward from C1-F5)
**Cross-agent agreement:** C2-PERF-1, C2-ARCH-1, C2-PERF-4 (3 lanes)

The `jwt()` callback queries the DB on every API request. Under load, this is the primary bottleneck. Confirmed by 3 lanes this cycle.

**Fix:** Add `lastCheckedAt` to the JWT. Skip DB query if within TTL (e.g., 60s). `tokenInvalidatedAt` still provides revocation guarantees.

---

### F6 (MEDIUM, MEDIUM confidence) — Recruiting candidate identity model is fragile
**Cross-agent agreement:** C2-CRIT-1 (1 lane)

Candidates are created with `username: nanoid(10)` — a random string they cannot use for normal login. The email is stored but not used as a login identifier on the normal login form. If a candidate loses their recruit link, they cannot access their account.

**Fix:** Allow email-based login for recruiting-created accounts, or surface the generated username after first login.

---

### F7 (LOW, HIGH confidence) — `redeemRecruitingToken` has dead `tokenExpired` catch branch
**Cross-agent agreement:** C2-DBG-1 (1 lane)

The outer catch handles `err.message === "tokenExpired"` but this error is never thrown in the current code. It was replaced by the atomic SQL check in a prior commit.

**Fix:** Remove the dead catch branch. Add a catch-all for unexpected errors.

---

### F8 (LOW, HIGH confidence) — `resetRecruitingInvitationAccountPassword` does not invalidate sessions
**Cross-agent agreement:** C2-CR-4 (1 lane)

Sets `tokenInvalidatedAt` (JWT revocation on next refresh) but does not delete existing sessions. There is a window where a compromised session remains valid.

**Fix:** Delete from `sessions` table for the user within the transaction.

---

### F9 (LOW, HIGH confidence) — Inconsistent `updatedAt` handling across DB mutations
**Cross-agent agreement:** C2-CR-5 (1 lane)

Some update paths set `updatedAt` manually, some use `withUpdatedAt()`, some forget entirely.

**Fix:** Audit all update paths. Create a consistent pattern using `withUpdatedAt()`.

---

### F10 (LOW, HIGH confidence) — File serve route bypasses `createApiHandler` wrapper
**Cross-agent agreement:** C2-CR-6 (1 lane)

Manual try/catch error handling instead of using the consistent wrapper.

**Fix:** Refactor to use `createApiHandler` or document why manual approach is needed.

---

### F11 (LOW, HIGH confidence) — API key effective role can escalate on creator promotion
**Cross-agent agreement:** C2-SEC-5 (1 lane)

If a key creator is promoted after key creation, the key's effective role is elevated to the creator's new role.

**Fix:** Document intended behavior or use `min(keyRoleRank, userRoleRank)` to cap at the key's declared role.

---

### F12 (LOW, MEDIUM confidence) — Recruiting invitation `metadata` is unvalidated JSONB
**Cross-agent agreement:** C2-SEC-6 (1 lane)

No validation on metadata keys/values. Internal keys like `accountPasswordResetRequired` could collide with user-supplied data.

**Fix:** Add Zod schema for metadata. Reserve internal key prefixes.

---

### F13 (LOW, MEDIUM confidence) — `DATABASE_PATH` path traversal potential in storage module
**Cross-agent agreement:** C2-SEC-7 (1 lane)

`resolve(process.env.DATABASE_PATH, "..")` is fragile.

**Fix:** Use dedicated `DATA_DIR` env var instead of deriving from `DATABASE_PATH`.

---

### F14 (LOW, HIGH confidence) — No tests for recruiting token redeem edge cases
**Cross-agent agreement:** C2-TE-1 (1 lane)

Critical function with no test coverage.

**Fix:** Add integration tests for `redeemRecruitingToken`.

---

### F15 (LOW, HIGH confidence) — No tests for audit event buffer flush failure
**Cross-agent agreement:** C2-TE-2 (1 lane)

Complex error handling with no test coverage.

**Fix:** Add unit tests for flush failure scenarios.

---

### F16 (LOW, HIGH confidence) — No loading state for recruit results page
**Cross-agent agreement:** C2-UX-1 (1 lane)

No `loading.tsx` file in the results directory.

**Fix:** Add skeleton loading component.

---

### F17 (LOW, MEDIUM confidence) — Score display may show excessive decimal places
**Cross-agent agreement:** C2-UX-2 (1 lane)

`formatScore` may produce long decimals for weighted scores.

**Fix:** Verify `formatScore` rounding behavior.

---

### F18 (LOW, HIGH confidence) — Contact email rendered without spam protection
**Cross-agent agreement:** C2-UX-3 (1 lane)

Raw `mailto:` link exposes recruiter email.

**Fix:** Add `rel="nofollow"` or use a contact form.

---

## Carry-forward DEFERRED items (status verified at HEAD `689cf61d`)

| ID | Severity | File+line | Status | Exit criterion |
| --- | --- | --- | --- | --- |
| F3 (C1) | MEDIUM | `recruiting-invitations.ts` candidateName/Email | DEFERRED -> NOW F2 | Dedicated encryption-migration cycle |
| F5 (C1) | MEDIUM | `auth/config.ts:394` JWT DB query | DEFERRED -> NOW F5 | Auth-perf cycle (met by this review) |
| F7 (C1) | LOW | client console.error (24 sites) | DEFERRED | Telemetry/observability cycle |
| F8 (C1) | LOW | SSE cleanup timer | DEFERRED | Next SSE feature work |
| F9 (C1) | LOW | SSE poll timer interval | DEFERRED | Next SSE feature work |
| F10 partial (C1) | LOW | Magic-byte encryption tests | DEFERRED | F3 implementation cycle |
| AGG-2 | LOW | Date.now caching in rate limiter | DEFERRED | Telemetry signal OR rate-limit module touched 2 more times |
| C3-AGG-5 | LOW | deploy-docker.sh size | DEFERRED | Modular extraction OR >1500 lines |
| C3-AGG-6 | LOW | deploy-docker.sh multi-tenant | DEFERRED | Multi-tenant deploy host added |
| C2-AGG-5 | LOW | 5 polling components | DEFERRED | Telemetry signal OR 7th instance |
| C2-AGG-6 | LOW | practice page perf | DEFERRED | p99 > 1.5s OR > 5k problems |
| DEFER-ENV-GATES | LOW | Env-blocked tests | DEFERRED | Fully provisioned CI/host |
| D1 | MEDIUM | JWT clock-skew | DEFERRED | Auth-perf cycle |

---

## Plan-vs-implementation reconciliation

Cycle 1 produced 10 findings and 5 were implemented (Tasks A-E). 5 were deferred. This cycle finds 18 new findings (1 HIGH, 5 MEDIUM, 12 LOW) plus carries forward all prior deferred items.
