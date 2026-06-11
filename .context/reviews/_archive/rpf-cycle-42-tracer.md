# RPF Cycle 42 — Tracer

**Date:** 2026-04-23
**Base commit:** 8912b987
**Reviewer angle:** Causal tracing of suspicious flows, competing hypotheses

## Findings

### TR-1: Quick-create `problemPoints` defaulting hides data integrity issues [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/quick-create/route.ts:84-93`

**Description:** Traced the data flow: `problemIds` and `problemPoints` enter through the Zod schema independently. At line 89, `body.problemPoints?.[i] ?? 100` silently defaults. This is a causal chain where the lack of schema-level validation leads to silent data corruption.

**Competing hypotheses:**
1. **Intentional default**: The developer intended 100 as a sensible default for unset point values.
2. **Schema oversight**: The developer forgot to validate lengths match and the `?? 100` was only meant as a null-safety fallback for the `problemPoints: undefined` case.

**Evidence for hypothesis 2:** The schema defines `problemPoints` as `z.array(z.number().int().min(1)).optional()`, suggesting it's meant to be either fully absent (all problems default) or fully present (all problems specified). A partial array doesn't fit this intent.

**Fix:** Add `.refine()` to enforce matching lengths.

**Confidence:** Medium

---

### TR-2: Access-code routes auth pattern diverges from recruiting routes — tracing the causal chain [LOW/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/access-code/route.ts`

**Description:** Traced why the access-code routes lack capability-based auth: they were likely written before the `capabilities` feature was added to `createApiHandler`, or the developer followed a different pattern. The recruiting routes were added/updated later with the capabilities pattern. This is a pattern drift that could lead to future vulnerabilities.

**Fix:** Align access-code routes with the recruiting pattern.

**Confidence:** Low (no current vulnerability)

---

## Sweep: Files Reviewed

All critical files as listed in other reviewer reports.
