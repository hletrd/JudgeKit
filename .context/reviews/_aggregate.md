# RPF Cycle 1 (new round) — Aggregate Review (2026-05-04)

**Date:** 2026-05-04
**HEAD reviewed:** `988435b5` (main)
**Reviewer:** Comprehensive multi-perspective (code-quality, security, perf, architect, debugger, test-engineer, tracer, verifier, critic, document-specialist, designer consolidated)

---

## NEW deduplicated findings this cycle

**Severity tally (NEW only):** 0 HIGH, 0 MEDIUM, 2 LOW.

### AGG1N-1: [RESOLVED] `redeemRecruitingToken` brute-force counter no longer incremented on format errors

- **File:** `src/lib/assignments/recruiting-invitations.ts:644-652`
- **Status:** FIXED — Lines 644-652 explicitly document that format validation errors do NOT increment the brute-force counter. Counter only incremented after actual password verification failures (line 564). Previous cycle #1 finding AGG1-1 fully resolved.

### AGG1N-2: [RESOLVED] `capture-screenshots.ts` moved to `scripts/`

- **Status:** FIXED — File moved to `scripts/capture-screenshots.ts` (commit `7f82c6a1`). No longer in repo root. Previous finding AGG1-5 resolved.

### AGG1N-3: [RESOLVED] `RUNNER_AUTH_TOKEN` empty string warning now covers all environments

- **File:** `src/lib/compiler/execute.ts:67-72`
- **Status:** FIXED — Warning at lines 67-72 fires when `COMPILER_RUNNER_URL` is set but `RUNNER_AUTH_TOKEN` is missing, regardless of NODE_ENV. Previous finding AGG1-3 resolved.

### AGG1N-4: [RESOLVED] `CODE_SIMILARITY_AUTH_TOKEN` warning already present

- **File:** `src/lib/assignments/code-similarity-client.ts:5-9`
- **Status:** FIXED — Warning at lines 5-9 fires when `CODE_SIMILARITY_URL` is set but `CODE_SIMILARITY_AUTH_TOKEN` is missing. Previous finding AGG1-6 resolved.

### AGG1N-5: [LOW] `DATA_RETENTION_LEGAL_HOLD` deprecated constant still exported alongside runtime function

- **File:** `src/lib/data-retention.ts:46-48`
- **Description:** The deprecated module-level constant `DATA_RETENTION_LEGAL_HOLD` (line 46-48) coexists with the new runtime function `isDataRetentionLegalHold()` (line 40-43). The deprecated constant is still exported and could be imported by new code that should use the function instead.
- **Confidence:** HIGH
- **Fix:** Remove the deprecated export or add an ESLint no-restricted-exports rule.

### AGG1N-6: [RESOLVED] `editUser` duplicate privilege check documented as defense-in-depth

- **File:** `src/lib/actions/user-management.ts:289-296`
- **Status:** ACCEPTED — Lines 289-291 explicitly document this as defense-in-depth. Previous finding AGG1-9 resolved via documentation.

### AGG1N-7: [RESOLVED] `editUser` Zod validation now runs after authorization

- **File:** `src/lib/actions/user-management.ts:252-259`
- **Status:** FIXED — Lines 252-255 document that Zod validation runs AFTER authorization checks to prevent schema probing. Error message unified to "updateUserFailed". Previous finding AGG1-10 resolved.

### AGG1N-8: [LOW] `token-hash.ts` still lacks algorithm identifier prefix

- **File:** `src/lib/security/token-hash.ts`
- **Description:** Previous finding AGG1-11. The function still returns a bare SHA-256 hex digest without a `sha256:` prefix. Low urgency since tokens can be regenerated.
- **Confidence:** LOW
- **Fix:** Consider prefixing with `sha256:` for future algorithm rotation. Deferred — low priority.

### AGG1N-9: [RESOLVED] `sanitizeHtml` IMG policy now documented

- **File:** `src/lib/security/sanitize-html.ts:70-73`
- **Status:** FIXED — JSDoc at lines 70-73 documents the root-relative-only IMG src policy. Previous finding AGG1-12 resolved.

### AGG1N-10: [RESOLVED] `incrementFailedRedeemAttempt` JSDoc now documents fire-and-forget tradeoff

- **File:** `src/lib/assignments/recruiting-invitations.ts:69-87`
- **Status:** FIXED — JSDoc at lines 69-87 documents the fire-and-forget design, TOCTOU race fix, and counter drift tradeoff. Previous finding AGG1-13 resolved.

### AGG1N-11: [RESOLVED] `toggleUserActive` super_admin restriction now documented

- **File:** `src/lib/actions/user-management.ts:63-72`
- **Status:** FIXED — JSDoc at lines 63-72 explains the super_admin deactivation/re-activation restriction. Previous finding AGG1-14 resolved.

### AGG1N-12: [RESOLVED] Auth cache stale window now documented with multi-instance warning

- **File:** `src/proxy.ts:21-25`
- **Status:** FIXED — Comments at lines 21-25 document the multiplied stale window in multi-instance deployments. Previous finding AGG1-16 resolved.

---

## Carry-forward DEFERRED items

All previously deferred items from the prior cycle aggregate remain valid. No path drift detected at HEAD `988435b5`.

| ID | Severity | Status | Exit criterion |
|---|---|---|---|
| AGG1-2 | MEDIUM | DEFERRED | Per-invitation-token rate limiting design decision |
| AGG1-4 | MEDIUM | CARRY | Rate-limit consolidation cycle |
| AGG1-7 | LOW | DEFERRED | Runtime re-read of legal hold (now function-based) |
| AGG1-8 | LOW | CARRY | Runtime assertion added; fragility concern remains |
| AGG1-15 | LOW | DEFERRED | DB time caching optimization |
| AGG1-17 | LOW | DEFERRED | CSP unsafe-inline known tradeoff |
| C3-AGG-5 through C1-AGG-22 | LOW | DEFERRED | Various exit criteria |
| SEC2-2, SEC2-3 | LOW | DEFERRED | Various |
| DSGN3-1, DSGN3-2 | LOW | DEFERRED | UX cycle |
| D1, D2 | MEDIUM | DEFERRED | Auth-perf cycle |
| ARCH-CARRY-1 | MEDIUM | DEFERRED | API-handler refactor |
| ARCH-CARRY-2 | LOW | DEFERRED | SSE perf cycle |
| PERF-3 | MEDIUM | DEFERRED | Anti-cheat perf |

No HIGH findings deferred. No security/correctness/data-loss findings deferred unjustifiably.

---

## Cross-agent agreement summary

- All HIGH-confidence findings from previous cycles have been resolved or documented.
- Only 2 LOW-severity items remain as actionable this cycle (AGG1N-5, AGG1N-8).

---

## Agent failures

None — consolidated single-pass review.

---

## Suggested PROMPT 3 priority order

1. **AGG1N-5 (deprecated DATA_RETENTION_LEGAL_HOLD export)** — remove deprecated export
2. **AGG1N-8 (token-hash algorithm prefix)** — optional, low priority