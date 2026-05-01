# Critic Review — RPF Cycle 1 (2026-05-01)

**Reviewer:** critic
**HEAD reviewed:** `894320ff`

---

## Multi-perspective critique

### Policy-code alignment

The most substantive finding this cycle is the **password.ts vs AGENTS.md mismatch** (C1-CR-1 / C1-SR-1). The code enforces more restrictive password checks than the documented policy allows. This is a policy violation regardless of whether the extra checks are "better" security — the project explicitly chose minimum-length-only, and the code violates that choice. Either the policy or the code must be updated to match.

### Carry-forward backlog health

The deferred backlog (17 items from prior cycles) has been well-maintained with exit criteria. However, several items (D1 JWT clock-skew, D2 JWT DB query per request, AGG-2 Date.now() in rate-limit, ARCH-CARRY-1 raw API handlers) are all MEDIUM items that have been deferred for 5+ cycles. The risk is that they become permanent residents. The recommendation is to schedule at least 1-2 MEDIUM deferred items per cycle going forward.

### Test coverage

The test infrastructure is comprehensive (vitest unit/integration/component + playwright e2e). However, the `password.ts` policy violation has no test that would catch it — the tests validate the current behavior, not the documented policy. A policy-conformance test (e.g., "password matching username is accepted" per AGENTS.md rules) would have caught this drift.

---

## Findings

### C1-CT-1: [MEDIUM] Password validation policy-code mismatch

- **File:** `src/lib/security/password.ts` vs `AGENTS.md:562-568`
- **Confidence:** HIGH
- **Description:** Cross-agreement with C1-CR-1 and C1-SR-1. The code implements checks that the documented policy explicitly forbids.
- **Fix:** Resolve the mismatch by either updating the policy or the code.

### C1-CT-2: [LOW] Deferred MEDIUM items should be scheduled for implementation

- **Confidence:** HIGH
- **Description:** 4 MEDIUM items (D1, D2, AGG-2, ARCH-CARRY-1) have been deferred for 5+ cycles with no forward progress. Recommend scheduling at least one per cycle.
- **Fix:** Add a planning directive to pick at least 1 MEDIUM deferred item per cycle.
