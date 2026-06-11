# Document-Specialist Pass — RPF Cycle 3/100

**Date:** 2026-04-27
**Lane:** document-specialist
**Scope:** Code/docs/comment alignment, with focus on cycle-2 plan accuracy and AGENTS.md/CLAUDE.md consistency

## Summary

Cycle 2 plan (`plans/open/2026-04-26-rpf-cycle-2-review-remediation.md`) accurately reflects the commits. Tasks A–F are all marked `[x]` with correct commit hashes. The plan structure follows the project's status-legend convention.

The documentation gaps that remain are pre-existing: AGENTS.md vs `password.ts` divergence (cycle-2 deferred AGG-11), and the unarchived plan files in `plans/open/` (CRIT3-1).

## Findings

### DOC3-1: [LOW] `AGENTS.md` `Password Validation` section conflicts with `src/lib/security/password.ts` (carried from cycle 2 AGG-11)

**File:** `AGENTS.md:516-521`, `src/lib/security/password.ts`
**Confidence:** MEDIUM

Cycle 2 deferred this with a quoted policy reference. The deferral note correctly identifies that the resolution requires user/PM input — either:
- (a) Strip dictionary + similarity checks from `password.ts` to match the doc.
- (b) Update `AGENTS.md` to allow dictionary + similarity checks.

Neither option is a doc-only fix.

**Fix (deferred):** No change this cycle. Re-flag in plan as "needs user/PM decision; do not silently change either side".

---

### DOC3-2: [LOW] `plans/open/` has 80+ files but `plans/open/README.md` doesn't describe the per-cycle archival pattern

**File:** `plans/open/README.md`
**Confidence:** LOW

Per CRIT3-1, the open dir has accumulated plans from many cycles. A short README convention note ("each cycle archives the plan from N-2 cycles back if all tasks `[x]`") would help future contributors.

**Fix:** Optional. Not a high-priority docs task.

---

### DOC3-3: [INFO] Cycle-2 plan correctly references the source aggregate path

**File:** `plans/open/2026-04-26-rpf-cycle-2-review-remediation.md:5`
**Confidence:** N/A (informational)

`**Source aggregate:** ` `.context/reviews/_aggregate.md` is the right path. Maintains traceability between aggregate findings and the remediation tasks. Good.

---

### DOC3-4: [LOW] `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:32-40` doc comment for `refreshAnalyticsCacheInBackground` is good but could mention the in-flight dedup invariant

**File:** `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:32-40`
**Confidence:** LOW

Current doc:
```
Failure handling: any failure (compute or DB-time fetch) sets the cooldown
timestamp to suppress thundering-herd refresh attempts. The cooldown
uses Date.now() directly — there's no DB call to fail here, simplifying
the error path compared to the previous nested try/catch.
```

Could add: "The caller must add the key to `_refreshingKeys` BEFORE invoking this function and rely on the `finally` to remove it. This guarantees in-flight dedup."

**Fix:** Optional doc addition. Not blocking.

## Verification Notes

- Cycle-2 plan task statuses verified against `git show <commit-hash>` for each cited commit.
- AGENTS.md vs password.ts divergence verified by reading both files.
- README.md in `plans/open/` checked.

## Confidence

- MEDIUM: DOC3-1 (carried).
- LOW: DOC3-2, DOC3-4 (optional doc tweaks).
- INFO: DOC3-3.

No HIGH severity. Cycle-3 doc work is light: optional one-comment addition (DOC3-4) and possibly a one-line README convention (DOC3-2) — both deferrable.
