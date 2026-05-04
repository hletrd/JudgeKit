# RPF Cycle 2 — Aggregate Review (2026-05-04)

**Date:** 2026-05-04
**HEAD reviewed:** `767b1fee` (main)
**Reviewer:** Comprehensive multi-perspective (code-quality, security, perf, architect, debugger, test-engineer, tracer, verifier, critic, document-specialist, designer consolidated)

---

## NEW deduplicated findings this cycle

**Severity tally (NEW only):** 0 HIGH, 0 MEDIUM, 2 LOW.

### AGG2-1: [RESOLVED] Password policy-code mismatch — fully fixed

- **File:** `src/lib/security/password.ts`
- **Status:** FIXED — Now only checks minimum length per AGENTS.md. All cycle-1 cross-agreement findings (C1-CR-1, C1-SR-1, C1-CT-1, C1-VE-1, C1-DB-2, C1-TR-1, C1-DOC-1) resolved.

### AGG2-2: [RESOLVED] DATA_RETENTION_LEGAL_HOLD deprecated constant removed

- **File:** `src/lib/data-retention.ts:45-47`
- **Status:** FIXED — Deprecated constant removed. Runtime function `isDataRetentionLegalHold()` present. Comment documents removal. Previous finding AGG1N-5 resolved.

### AGG2-3: [LOW] No unit test for ConditionalHeader component

- **File:** `src/components/layout/conditional-header.tsx`
- **Confidence:** MEDIUM
- **Source:** C2-TE-1
- **Description:** New ConditionalHeader component has no dedicated test. A component test verifying admin vs non-admin rendering branches would catch regressions.
- **Fix:** Add component test mocking `usePathname()`.
- **Exit criteria:** Component test exists covering both branches.

### AGG2-4: [LOW] Recruiting validate test missing expired invitation case

- **File:** `tests/unit/api/recruiting-validate.route.test.ts`
- **Confidence:** LOW
- **Source:** C2-TE-2
- **Description:** Test suite covers valid, revoked, invalid token, and rate-limited scenarios. Missing: expired invitation and expired assignment deadline cases.
- **Fix:** Add test cases for expired invitation and expired assignment deadline.
- **Exit criteria:** Test suite covers the `invalid()` return path for expired invitations and deadlines.

---

## Carry-forward DEFERRED items

All previously deferred items from the cycle 1 aggregate remain valid. No path drift detected at HEAD `767b1fee`.

| ID | Severity | Status | Exit criterion |
|---|---|---|---|
| AGG1-2 | MEDIUM | DEFERRED | Per-invitation-token rate limiting design decision |
| AGG1-4 | MEDIUM | CARRY | Rate-limit consolidation cycle |
| AGG1-7 | LOW | DEFERRED | Runtime re-read of legal hold (now function-based) |
| AGG1-8 | LOW | CARRY | Runtime assertion added; fragility concern remains |
| AGG1-15 | LOW | DEFERRED | DB time caching optimization |
| AGG1-17 | LOW | DEFERRED | CSP unsafe-inline known tradeoff |
| C1-CR-2/C1-AR-2 | LOW | CARRY | import.ts `any` types |
| C1-CR-3/C1-DB-1 | LOW | CARRY | latestSubmittedAt mixed-type comparison |
| C1-PR-1/C2-PR-2 | LOW | CARRY | Polling intervals not visibility-paused |
| C1-PR-2/C2-PR-1 | LOW | CARRY | Sequential DB queries in getAssignmentStatusRows |
| C1-AR-1/C2-AR-1 | LOW | CARRY | rateLimits table overloaded for SSE |
| C1-CR-4/C2-CR-2 | LOW | CARRY | 25 console.error sites |
| ARCH-CARRY-1 | MEDIUM | DEFERRED | API-handler refactor (84 raw handlers) |
| ARCH-CARRY-2 | LOW | DEFERRED | SSE perf cycle |
| D1 | MEDIUM | DEFERRED | JWT clock-skew |
| D2 | MEDIUM | DEFERRED | JWT DB query per request |
| PERF-3 | MEDIUM | DEFERRED | Anti-cheat perf |
| DSGN3-1, DSGN3-2 | LOW | DEFERRED | UX cycle |
| SEC2-2, SEC2-3 | LOW | DEFERRED | Various |

No HIGH findings deferred. No security/correctness/data-loss findings deferred unjustifiably.

---

## Cross-agent agreement

| Finding | Agents agreeing |
|---|---|
| Password policy resolved | code-reviewer, security-reviewer, verifier, document-specialist, tracer |
| DATA_RETENTION_LEGAL_HOLD resolved | verifier, code-reviewer |
| ConditionalHeader clean | code-reviewer, architect, designer, debugger, tracer |
| import.ts `any` types (carry) | code-reviewer, architect |
| latestSubmittedAt mixed-type (carry) | code-reviewer, debugger |
