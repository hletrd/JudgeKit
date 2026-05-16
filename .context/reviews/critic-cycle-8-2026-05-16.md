# Critic — RPF Cycle 8 (2026-05-16)

**Date:** 2026-05-16

---

## Cross-perspective critique

### CRIT8b-1 — User-injected commit batch contained a lint error
**Severity:** MEDIUM (gate-blocking) **Confidence:** HIGH
**File:** `src/app/(dashboard)/dashboard/admin/settings/settings-tabs.tsx`

The patch landed with a lint error live (calling `setActiveTab(hash)`
inside `useEffect`). This means the patch was applied without running
`npm run lint` locally, which violates the cycle's gate-fix
requirement. Fixed this cycle by deferring the initial sync via
`queueMicrotask` and adding a guard to avoid redundant setState.

---

### CRIT8b-2 — Three test failures shipped in the patch
**Severity:** MEDIUM (gate-blocking) **Confidence:** HIGH
**Files:** `tests/unit/plugins.secrets.test.ts`,
`tests/unit/data-retention.test.ts`, `tests/unit/api/plugins.route.test.ts`

Same root cause as CRIT8b-1: gates weren't run locally. Cycle-8 fixed
all three tests to align with the new policies (plaintext secrets, 5-year
chat retention, userRole forwarding).

---

### CRIT8b-3 — TLE budget regression has 9 new tests
**Severity:** Positive observation **Confidence:** HIGH

The TLE budget fix is well-covered by the new `classify_test_case_verdict`
helper and 9 unit tests including the explicit "765ms < 1000ms" case
that motivated the change. This is the right shape for a regression-
prone judge primitive.

---

### CRIT8b-4 — Documentation drift: AGENTS.md still references prior plugin-secret policy
**Severity:** LOW **Confidence:** MEDIUM
**File:** `AGENTS.md` (search for "plugin secret" / "encryption" if present)

If AGENTS.md or `.context/plans/` documents the encryption-at-storage
policy as a security invariant, the plaintext switch needs a doc
update. Defer: needs a documentation grep next cycle.

---

### CRIT8b-5 — No commit history yet for the user-injected fix batch
**Severity:** Process **Confidence:** HIGH

The patches arrived as one big uncommitted diff. This cycle commits
them in fine-grained chunks per file/topic per the repo's commit
policy.
