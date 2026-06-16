# Architect — design/coupling (cycle 1, 2026-06-16)

### ARC-1 (Low) Single-line stdin contract is implicit across 7 adapters
The args wire format (one compact JSON line) is assumed by every adapter's harness but not asserted anywhere central. Coupling is fine but fragile (see DBG-2). Recommend a documented invariant + an encodeArgs assertion (no newline in output) as the single source of truth.

### ARC-2 (OK) Adapter registry is clean and extensible
`registry.ts` maps language→adapter; `FUNCTION_JUDGING_LANGUAGES` derived from keys; UI reads the same set. Good single source. No layering violations.

### ARC-3 (Low) FunctionType authorability split lives in two places conceptually
`AUTHORABLE_FUNCTION_TYPES` (types.ts) gates UI selects + zod; adapters still handle the full SUPPORTED set. This is intentional (v1.1 re-enable) and documented. Keep, but add a single test that AUTHORABLE ⊆ SUPPORTED and every authorable type has adapter coverage.

### ARC-4 (Low) compute-expected duplicates language-config resolution from compiler/run
`compute-expected/route.ts:87-107` re-implements DB-config-then-builtin fallback also present in the compiler run route. Extract a shared `resolveExecLanguage(language)` helper to avoid drift.
