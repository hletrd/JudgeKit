# RPF Cycle 16 — Critic

**Date:** 2026-04-24
**HEAD:** bbc1ef67

## Scope

Multi-perspective critique of the whole change surface, focusing on systemic risks and cross-cutting concerns.

## Findings

### C-1: [HIGH] Schema-Export Drift is a Systemic Risk
**Confidence:** High

The root cause of CR-1, CR-2, S-1, S-2, A-1, D-1, D-2, V-2 is the same: `SANITIZED_COLUMNS` in the export engine is manually maintained and not validated against the actual schema. Every schema migration that touches sensitive columns creates a risk of drift.

This is not just about the two specific stale references — it's about the process gap. The fact that 8 review perspectives all flagged the same issue from different angles is strong signal that this is a real, high-priority problem.

**Fix:** See A-1. Short-term: clean up stale references. Long-term: derive from schema types or add a compile-time/runtime validation.

---

### C-2: [MEDIUM] `judgeWorkers.secretToken` Column is Overdue for Removal
**Confidence:** High

The `secretToken` column has been deprecated since the hash-based auth was introduced. New registrations set it to `null`. The auth flow rejects workers without `secretTokenHash`. The column exists purely for backward compatibility with legacy workers that likely no longer exist in production.

Every review cycle since cycle 10 has flagged or deferred this. The recruitingInvitations.token column was dropped in cycle 15 with the same pattern. It's time to drop `judgeWorkers.secretToken` too.

**Fix:** Drop the column, create a Drizzle migration, remove from `SANITIZED_COLUMNS` and `ALWAYS_REDACT`.

---

### C-3: [LOW] DRY Violation in `isExpired` SQL Expression
**Confidence:** High

Same as CR-5 and A-4. The `isExpired` SQL expression is duplicated 4 times in `recruiting-invitations.ts`. This is a maintainability risk.

**Fix:** Extract into a shared SQL fragment.

---

## Cross-Agreement

8 of 8 review perspectives (code-reviewer, security-reviewer, perf-reviewer, architect, test-engineer, debugger, verifier, critic) agree on the export sanitization drift issue. This is the highest-signal finding of this cycle.
