# Aggregate Review — Cycle 3 (2026-05-03)

**Date:** 2026-05-03
**HEAD reviewed:** `ae528d9b`
**Reviewers:** code-reviewer, perf-reviewer, security-reviewer, critic, architect, debugger, verifier, tracer, test-engineer, document-specialist, designer (11 lanes; per-agent files in `.context/reviews/2026-05-03-cycle3/<agent>.md`).

---

## Total deduplicated NEW findings (applicable at HEAD `ae528d9b`)

**1 HIGH, 3 MEDIUM, 8 LOW NEW.**

---

## Deduplicated Findings (merged across agents, preserving highest severity)

### F1 (HIGH, HIGH confidence) — `incrementFailedRedeemAttempt` has TOCTOU race — brute-force lockout bypassable via concurrent requests
**Cross-agent agreement:** C3-SEC-1, C3-CR-1, C3-CRIT-1, C3-DBG-1, C3-VER-1, C3-TR-1 (6 lanes)

The per-invitation brute-force counter (added in cycle 2 to address C2-F1) uses a non-atomic read-modify-write pattern: SELECT metadata, increment in JS, UPDATE metadata. Concurrent failed redeems for the same token all read the same counter value, increment to the same result, and write it back — losing increments. An attacker sending 5+ concurrent requests with wrong passwords never triggers the lockout.

**Fix:** Replace with atomic SQL: `UPDATE recruiting_invitations SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{_failedRedeemAttempts}', (COALESCE((metadata->>'_failedRedeemAttempts')::int, 0) + 1)::text) WHERE token_hash = ?`. This acquires a row-level lock and serializes the increment.

---

### F2 (MEDIUM, HIGH confidence) — Initial redeem path does not increment brute-force counter on password validation failure
**Cross-agent agreement:** C3-SEC-2, C3-CR-5, C3-CRIT-2, C3-DBG-2, C3-VER-2, C3-TR-2 (6 lanes)

When `getPasswordValidationError(accountPassword)` fails during the initial redeem (line 512-519), the function returns the error without calling `incrementFailedRedeemAttempt`. The re-entry path (line 446-452) correctly increments. This asymmetry means an attacker with a valid token can try unlimited passwords on the initial redeem path.

**Fix:** Add `void incrementFailedRedeemAttempt(token)` before the return at line 519. Combine with F1 fix for atomicity.

---

### F3 (MEDIUM, MEDIUM confidence) — `metadata` JSONB namespace collision risk between internal keys and user data
**Cross-agent agreement:** C3-CRIT-3, C3-TR-3, C3-SEC-7 (3 lanes)

Internal system keys (`accountPasswordResetRequired`, `_failedRedeemAttempts`) share the same `metadata` JSONB namespace as user-supplied metadata. A caller of `createRecruitingInvitation` passing `metadata: { accountPasswordResetRequired: "true" }` would set the password-reset flag without actually resetting the password.

**Fix:** Reserve internal keys with a prefix (`_sys.`) that is rejected at the API input boundary. Rename existing internal keys to use the prefix. Add validation in `createRecruitingInvitation`/`bulkCreateRecruitingInvitations` to reject keys starting with `_sys.`.

---

### F4 (MEDIUM, MEDIUM confidence) — No tests for `incrementFailedRedeemAttempt` or `redeemRecruitingToken` counter behavior
**Cross-agent agreement:** C3-TE-1, C3-TE-2 (2 lanes)

The brute-force counter was added in cycle 2 with no test coverage. The `redeemRecruitingToken` function also has no tests (carry-forward C2-F14). Without tests, the race condition in F1 and the missing counter increment in F2 were not caught.

**Fix:** Add unit/integration tests for `redeemRecruitingToken` covering: sequential counter increments, lockout trigger, initial vs. re-entry paths, counter increment on password validation failure.

---

### F5 (LOW, HIGH confidence) — Privacy page `mailto:` link lacks `rel="nofollow"`
**Cross-agent agreement:** C3-SEC-4, C3-CR-6, C3-CRIT-4, C3-VER-3, C3-UX-1 (5 lanes)

Same class as C2-F18 (recruiter email, fixed in commit `42df4c66`). The privacy page has a `mailto:privacy@xylolabs.com` link without spam protection. The cycle 2 fix only addressed the recruiter contact email.

**Fix:** Add `rel="nofollow"` to the anchor tag at `src/app/(public)/privacy/page.tsx:78`.

---

### F6 (LOW, HIGH confidence) — `hashToken` function duplicated across `recruiting-invitations.ts` and `judge/auth.ts`
**Cross-agent agreement:** C3-CR-4, C3-ARCH-2, C3-CRIT-5 (3 lanes)

Both modules define identical `hashToken` functions using `createHash("sha256").update(token).digest("hex")`. DRY violation — if the hash algorithm changes, one may be missed.

**Fix:** Export `hashToken` from a shared module (e.g., `src/lib/security/token-hash.ts`) and import in both consumers.

---

### F7 (LOW, MEDIUM confidence) — `ALWAYS_REDACT` in export.ts excludes `judgeWorkers` secrets without documentation
**Cross-agent agreement:** C3-SEC-5, C3-VER-4, C3-DOC-2 (3 lanes)

Full-fidelity backup exports contain plaintext `secretTokenHash` and `judgeClaimToken` for judge workers. Sanitized exports correctly redact them. The exclusion from `ALWAYS_REDACT` appears intentional for disaster recovery but is not documented.

**Fix:** Add a comment in `ALWAYS_REDACT` explaining why worker secrets are retained in full-fidelity backups.

---

### F8 (LOW, MEDIUM confidence) — Privacy page data retention periods are hardcoded
**Cross-agent agreement:** C3-DOC-1, C3-UX-4 (2 lanes)

Retention periods (90, 30, 180, 365 days) are hardcoded in the privacy page component rather than read from system settings. If an operator changes retention periods, the privacy page shows stale information.

**Fix:** Read retention periods from the same config used by `startSensitiveDataPruning`, or add a prominent code comment noting the values must be kept in sync.

---

### F9 (LOW, MEDIUM confidence) — Recruit results page has no empty state for zero-problem assignments
**Cross-agent agreement:** C3-UX-2 (1 lane)

When `assignmentProblemRows` is empty, the page renders a card with heading but no content. No user-friendly empty state message.

**Fix:** Add an empty-state message when `assignmentProblemRows.length === 0`.

---

### F10 (LOW, MEDIUM confidence) — Magic-byte verification tests do not cover `text/` null-byte edge cases
**Cross-agent agreement:** C3-TE-3 (1 lane)

The text-type verification path (null-byte check in first 8KB) lacks explicit test cases for edge conditions.

**Fix:** Add test cases for text files with null bytes in/outside the first 8KB, and empty text files.

---

### F11 (LOW, MEDIUM confidence) — `DATABASE_PATH` derivation for `getDataDir()` is fragile (carry-forward C2-F13)
**Cross-agent agreement:** C3-SEC-6 (1 lane)

`getDataDir()` resolves `process.env.DATABASE_PATH` parent as data root. If the path is a symlink or has unusual structure, this could resolve to an unexpected directory.

**Fix:** Use dedicated `DATA_DIR` env var instead of deriving from `DATABASE_PATH`.

---

### F12 (LOW, LOW confidence) — Recruiting `validate` endpoint leaks token existence via response timing
**Cross-agent agreement:** C3-SEC-3 (1 lane)

The `/api/v1/recruiting/validate` endpoint queries two tables when the token exists vs. one when it doesn't, creating a measurable timing difference. Low risk since tokens are 32-byte random strings.

**Fix:** Add a constant-time delay or dummy DB query on the invalid path. Low priority.

---

## Carry-forward DEFERRED items (status verified at HEAD `ae528d9b`)

| ID | Severity | File+line | Status | Exit criterion |
| --- | --- | --- | --- | --- |
| F2 (C1/C2) | MEDIUM | `recruiting-invitations.ts` candidateName/Email | DEFERRED | Dedicated encryption-migration cycle OR compliance requirement |
| F5 (C1/C2) | MEDIUM | `auth/config.ts:399` JWT DB query | DEFERRED | Auth-perf cycle |
| C1-F7 | LOW | Client console.error (24 sites) | DEFERRED | Telemetry/observability cycle |
| C1-F8 | LOW | SSE cleanup timer | DEFERRED | Next SSE feature work |
| C1-F9 | LOW | SSE poll timer interval | DEFERRED | Next SSE feature work |
| C2-F9 | LOW | Inconsistent `updatedAt` handling | DEFERRED | DB schema maintenance cycle |
| C2-F10 | LOW | File route bypasses `createApiHandler` | DEFERRED | Next file-route modification |
| C2-F11 | LOW | API key role escalation | DEFERRED | API key feature review cycle |
| C2-F12 | LOW | Recruiting metadata unvalidated JSONB | DEFERRED | Recruiting feature expansion cycle |
| C2-F13/F11 | LOW | `DATABASE_PATH` derivation | DEFERRED | Infrastructure config audit cycle |
| C2-F14/F15 | LOW | Missing tests for redeem/audit | DEFERRED | Integration test suite setup |
| C2-F17 | LOW | Score decimal places | DEFERRED | Next scoring display change |
| AGG-2 | LOW | Date.now caching | DEFERRED | Rate-limit module touched 2 more times |
| C3-AGG-5 | LOW | deploy-docker.sh size | DEFERRED | Modular extraction OR >1500 lines |
| C3-AGG-6 | LOW | deploy-docker.sh multi-tenant | DEFERRED | Multi-tenant deploy host added |
| C2-AGG-5 | LOW | 5 polling components | DEFERRED | Telemetry signal OR 7th instance |
| C2-AGG-6 | LOW | Practice page perf | DEFERRED | p99 > 1.5s OR > 5k problems |
| DEFER-ENV-GATES | LOW | Env-blocked tests | DEFERRED | Fully provisioned CI/host |
| D1 | MEDIUM | JWT clock-skew | DEFERRED | Auth-perf cycle |

---

## Plan-vs-implementation reconciliation

Cycle 1 produced 10 findings, 5 implemented, 5 deferred.
Cycle 2 produced 18 findings, 7 implemented, 11+carry-forward deferred.
This cycle finds 12 new findings (1 HIGH, 3 MEDIUM, 8 LOW) plus carries forward all prior deferred items.

Note on F1 deferral risk: F1 is HIGH severity and directly undermines the cycle 2 fix for C2-F1 (also HIGH). It should NOT be deferred — it must be implemented this cycle.
