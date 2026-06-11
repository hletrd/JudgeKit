# Critic Review — Cycle 12 (HEAD: ecfa0b6c)

**Date:** 2026-05-11
**Reviewer:** critic
**Scope:** Multi-perspective critique of the change surface

---

## Findings

### C12-CRIT-1: The apiFetch memory leak is a clear regression from prior cleanup work
**Severity:** MEDIUM | **Confidence:** High
**File:** `src/lib/api/client.ts:97-98`

The cycle 9/10 work added AbortController-based cancellation and timeout cleanup to apiFetch. However, the implementation was incomplete: the cleanup path was only added for the branch that receives an external signal, not the default branch that creates its own timeout signal. This is a classic half-measure that leaves a real bug in the most common code path.

The fact that this wasn't caught in prior reviews or tests suggests that:
1. The apiFetch tests don't verify resource cleanup
2. The code reviewer who added the feature didn't consider the no-signal branch
3. The pattern (withTimeout + cleanupWithTimeout) is complex enough that it's easy to miss one branch

**Recommendation:** Simplify the apiFetch implementation to avoid branching on signal presence. Always use `withTimeout` (with a synthetic never-aborting signal when none is provided) so cleanup is uniform.

---

### C12-CRIT-2: Cycle 11's "replace unsafe as casts" fix was incomplete
**Severity:** LOW | **Confidence:** High
**File:** `src/hooks/use-submission-polling.ts`, `src/components/exam/countdown-timer.tsx`, `src/lib/compiler/execute.ts`, etc.

The cycle 11 commit message says "replace unsafe as casts with runtime narrowing in submission polling" but the fix only addressed some casts. Several `as Record<string, unknown>` casts remain in `normalizeSubmission`, plus new instances in countdown-timer and compiler/execute. This suggests the fix was scoped too narrowly.

**Recommendation:** Do a codebase-wide search for `as ` patterns (excluding legitimate `as const` and type assertions) and systematically address them in the next cycle.

---

## Cross-Agent Agreement

- apiFetch leak: code-reviewer, perf-reviewer, security-reviewer, debugger, architect, critic ALL flag this as the top issue. **High signal.**
- Remaining `as` casts: code-reviewer, security-reviewer, debugger, architect, critic agree on prevalence. **High signal.**
