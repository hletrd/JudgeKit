# Security Reviewer — Function-Judging (cycle 1, 2026-06-16)

Authorized defensive review of the owner's own platform.

## Findings

### SEC-1 (Confirmed-OK) Reference solution non-exposure
`api/v1/problems/[id]/route.ts:66-72` strips `referenceSolution` for non-managers via destructure-and-omit. compute-expected route (`compute-expected/route.ts:49-54`) gates on author OR `problems.edit` cap AND `canManageProblem`. Verdict: correctly author-only. Confidence: High.

### SEC-2 (Low) compute-expected runs author-supplied code with author privileges
`compute-expected/route.ts:131` executes the assembled reference solution via `executeCompilerRun` (sandboxed compiler path). This is author-initiated arbitrary code execution, but it is the SAME sandbox used by the playground and only reachable by users with problem-edit capability — accepted risk consistent with existing playground exposure. Rate-limited via `rateLimit: "problems:update"`. Confidence: High. No change; ensure the sandbox resource limits match the playground.

### SEC-3 (Low) Per-case `error` field echoes raw stderr/compileOutput to the author client
`compute-expected/route.ts:143,163,181` returns `run.compileOutput` / `run.stderr` verbatim. Author-only surface, so low risk, but stderr could contain sandbox host paths. Confidence: Medium. Consider trimming absolute host paths from returned diagnostics.

### SEC-4 (Confirmed-OK) referenceSolution language constrained to harness set
`validators/problem-management.ts:22` refines language via `supportsFunctionJudging`; claim-time assembly (`judge/claim/route.ts`) re-parses spec with `parseFunctionSpec`. Defense-in-depth present. Confidence: High.

## No injection vectors found
Student code is sandwiched (prelude + student + main) and compiled in the existing judge sandbox; no eval of author/student text in the Next.js process. functionSpec identifiers are regex-validated (`^[A-Za-z_][A-Za-z0-9_]*$`) before interpolation into generated harness source, preventing harness code injection via function/param names. Confidence: High.
