# Architect — Cycle 3 Architectural Review

## C3-ARCH-1: Transaction boundary inconsistency across modules

**Files:** Multiple
**Severity:** MEDIUM | Confidence: High

Some modules use `execTransaction` consistently (rate-limit, api-rate-limit). Others use `db.transaction` directly (exam-sessions). Others don't use transactions at all for multi-query reads (participant-timeline). This inconsistency makes it hard to reason about isolation guarantees and increases the risk of future bugs when developers copy patterns from the wrong module.

**Recommendation:** Standardize on `execTransaction` for all transaction needs, or establish clear guidelines: "Any function that reads from 2+ related tables must use a transaction."

---

## C3-ARCH-2: Raw SQL helpers are not transaction-aware

**File:** `src/lib/db/queries.ts`
**Severity:** MEDIUM | Confidence: High

The `rawQueryOne` and `rawQueryAll` helpers are convenience wrappers around `pool.query()`, but they have no concept of transactions. This forces callers to either (a) not use raw SQL inside transactions, or (b) bypass the helpers and use the transaction client directly. Both options are suboptimal.

**Recommendation:** Make raw query helpers accept an optional client parameter, defaulting to `pool`.
