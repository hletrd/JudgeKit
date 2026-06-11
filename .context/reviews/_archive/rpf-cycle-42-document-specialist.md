# RPF Cycle 42 — Document Specialist

**Date:** 2026-04-23
**Base commit:** 8912b987
**Reviewer angle:** Doc/code mismatches against authoritative sources

## Findings

### DOC-1: Quick-create `problemPoints` behavior is undocumented [LOW/MEDIUM]

**File:** `src/app/api/v1/contests/quick-create/route.ts`

**Description:** The quick-create endpoint's handling of mismatched `problemPoints` and `problemIds` lengths is undocumented. The Zod schema allows `problemPoints` as optional, and the code defaults unmatched entries to 100 points. Neither the schema comments nor the handler code explain this behavior. An API consumer would not know that partial `problemPoints` arrays are accepted and silently padded.

**Fix:** Either:
1. Add validation to reject mismatches (recommended), or
2. Add JSDoc/comment explaining the default behavior

**Confidence:** Medium

---

## Carry-Over Items

- Prior DOC-1: SSE route ADR (deferred, LOW/LOW)
- Prior DOC-2: Docker client dual-path docs (deferred, LOW/LOW)

## Sweep: Files Reviewed

- API route files with schema definitions
- `src/lib/validators/` directory
- `src/lib/assignments/recruiting-constants.ts`
